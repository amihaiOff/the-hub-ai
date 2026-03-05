import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { importBulkSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/budget/transactions/import
 * Import transactions from Riseup CSV with payee resolution and category matching.
 *
 * - Resolves payees by name (case-insensitive), creates new ones for unknowns
 * - Auto-creates new Riseup categories from CSV (skips deleted ones)
 * - Matches Riseup categories → app categories via DB mapping
 * - Falls back to payee's default category if no mapping
 * - Detects duplicates: transactionDate + payeeName.toLowerCase() + amountIls
 * - Creates transactions one-by-one (Neon compatibility)
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = importBulkSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { transactions } = validation.data;

    // Fetch all existing payees for the household
    const existingPayees = await prisma.budgetPayee.findMany({
      where: { householdId },
      select: { id: true, name: true, categoryId: true },
    });

    // Build case-insensitive lookup map
    const payeeLookup = new Map<string, { id: string; categoryId: string | null }>();
    for (const p of existingPayees) {
      payeeLookup.set(p.name.toLowerCase().trim(), { id: p.id, categoryId: p.categoryId });
    }

    // Fetch all Riseup categories for DB-driven mapping
    const riseupCategories = await prisma.riseupCategory.findMany({
      where: { householdId },
      select: { name: true, budgetCategoryId: true, isDeleted: true },
    });

    // Build Riseup category → budget category ID lookup
    const riseupMapping = new Map<string, string | null>();
    const knownRiseupNames = new Set<string>();
    for (const rc of riseupCategories) {
      riseupMapping.set(rc.name.trim(), rc.budgetCategoryId);
      knownRiseupNames.add(rc.name.trim());
    }
    const deletedRiseupNames = new Set(
      riseupCategories.filter((rc) => rc.isDeleted).map((rc) => rc.name.trim())
    );

    // Collect unique Riseup categories from this import batch to auto-add
    const newRiseupCategoryNames = new Set<string>();
    for (const tx of transactions) {
      if (tx.riseupCategory) {
        const name = tx.riseupCategory.trim();
        if (name && !knownRiseupNames.has(name) && !deletedRiseupNames.has(name)) {
          newRiseupCategoryNames.add(name);
        }
      }
    }

    // Auto-create new Riseup categories
    for (const name of newRiseupCategoryNames) {
      try {
        await prisma.riseupCategory.create({
          data: { name, householdId },
        });
        knownRiseupNames.add(name);
        riseupMapping.set(name, null); // No mapping yet
      } catch {
        // Ignore unique constraint violations (concurrent imports)
      }
    }

    // Fetch existing transactions for duplicate detection
    // Get date range from the import batch
    const dates = transactions.map((t) => t.transactionDate);
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));

    const existingTransactions = await prisma.budgetTransaction.findMany({
      where: {
        householdId,
        transactionDate: {
          gte: new Date(minDate),
          lte: new Date(maxDate),
        },
      },
      include: {
        payee: { select: { name: true } },
      },
    });

    // Build duplicate detection set (use toFixed(2) for consistent decimal comparison)
    const existingKeys = new Set<string>();
    for (const tx of existingTransactions) {
      const payeeName = tx.payee?.name?.toLowerCase().trim() ?? '';
      const key = `${tx.transactionDate.toISOString().split('T')[0]}|${payeeName}|${Number(tx.amountIls).toFixed(2)}`;
      existingKeys.add(key);
    }

    let created = 0;
    let duplicatesSkipped = 0;
    const payeesCreated: string[] = [];

    for (const tx of transactions) {
      const payeeNameLower = tx.payeeName.toLowerCase().trim();

      // Check for duplicate (use toFixed(2) for consistent precision)
      const dupKey = `${tx.transactionDate}|${payeeNameLower}|${tx.amountIls.toFixed(2)}`;
      if (existingKeys.has(dupKey)) {
        duplicatesSkipped++;
        continue;
      }

      // Resolve payee (upsert to handle concurrent imports safely)
      let payeeInfo = payeeLookup.get(payeeNameLower);
      if (!payeeInfo) {
        try {
          const newPayee = await prisma.budgetPayee.create({
            data: {
              name: tx.payeeName.trim(),
              householdId,
            },
          });
          payeeInfo = { id: newPayee.id, categoryId: null };
          payeesCreated.push(tx.payeeName.trim());
        } catch {
          // Handle unique constraint violation (concurrent import)
          const existing = await prisma.budgetPayee.findFirst({
            where: { householdId, name: tx.payeeName.trim() },
            select: { id: true, categoryId: true },
          });
          if (existing) {
            payeeInfo = { id: existing.id, categoryId: existing.categoryId };
          } else {
            throw new Error(`Failed to create or find payee: ${tx.payeeName.trim()}`);
          }
        }
        payeeLookup.set(payeeNameLower, payeeInfo);
      }

      // Resolve category via DB-driven Riseup mapping, then payee default
      let categoryId: string | null = null;
      if (tx.riseupCategory) {
        const riseupName = tx.riseupCategory.trim();
        categoryId = riseupMapping.get(riseupName) ?? null;

        // Set payee default category from Riseup mapping if payee has no default yet
        if (categoryId && !payeeInfo.categoryId) {
          try {
            await prisma.budgetPayee.update({
              where: { id: payeeInfo.id },
              data: { categoryId },
            });
            payeeInfo.categoryId = categoryId;
          } catch (err) {
            console.warn('Failed to set payee default category:', err);
          }
        }
      }
      if (!categoryId && payeeInfo.categoryId) {
        categoryId = payeeInfo.categoryId;
      }

      // Create the transaction
      await prisma.budgetTransaction.create({
        data: {
          type: tx.type,
          transactionDate: new Date(tx.transactionDate),
          paymentDate: tx.paymentDate ? new Date(tx.paymentDate) : null,
          amountIls: tx.amountIls,
          currency: tx.currency,
          amountOriginal: tx.amountOriginal ?? tx.amountIls,
          categoryId,
          payeeId: payeeInfo.id,
          paymentMethod: tx.paymentMethod,
          paymentNumber: tx.paymentNumber ?? null,
          totalPayments: tx.totalPayments ?? null,
          notes: tx.notes ?? null,
          source: tx.source,
          paymentIdentifier: tx.paymentIdentifier ?? null,
          excludedFromFlow: tx.excludedFromFlow,
          householdId,
        },
      });

      // Add to existing keys to prevent duplicates within the same batch
      existingKeys.add(dupKey);
      created++;
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        duplicatesSkipped,
        payeesCreated,
      },
    });
  } catch (error) {
    console.error('Error importing transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import transactions' },
      { status: 500 }
    );
  }
}
