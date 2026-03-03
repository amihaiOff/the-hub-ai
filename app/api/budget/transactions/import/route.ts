import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { importBulkSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { RISEUP_CATEGORY_MAP } from '@/lib/utils/riseup-csv-parser';

/**
 * POST /api/budget/transactions/import
 * Import transactions from Riseup CSV with payee resolution and category matching.
 *
 * - Resolves payees by name (case-insensitive), creates new ones for unknowns
 * - Matches Riseup categories → app categories by name (case-insensitive)
 * - Falls back to payee's default category if no category name match
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

    // Fetch all categories for the household (for category name matching)
    const existingCategories = await prisma.budgetCategory.findMany({
      where: { householdId },
      select: { id: true, name: true },
    });

    // Build case-insensitive category name lookup
    const categoryByName = new Map<string, string>();
    for (const c of existingCategories) {
      categoryByName.set(c.name.toLowerCase().trim(), c.id);
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

      // Resolve category:
      // 1. Try direct name match (Riseup category → app category)
      // 2. Try Hebrew→English mapping from RISEUP_CATEGORY_MAP
      // 3. Fall back to payee's default category
      let categoryId: string | null = null;
      if (tx.riseupCategory) {
        const riseupCatLower = tx.riseupCategory.toLowerCase().trim();
        // Direct name match
        categoryId = categoryByName.get(riseupCatLower) ?? null;
        // Hebrew→English mapping
        if (!categoryId) {
          const englishName = RISEUP_CATEGORY_MAP[tx.riseupCategory.trim()];
          if (englishName) {
            categoryId = categoryByName.get(englishName.toLowerCase().trim()) ?? null;
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
