import { prisma } from '@/lib/db';
import type { ImportTransactionInput } from '@/lib/validations/budget';
import { findMatchingRule } from '@/lib/utils/budget';

export interface ImportResult {
  created: number;
  duplicatesSkipped: number;
  payeesCreated: string[];
}

/**
 * Import transactions with payee resolution, duplicate detection,
 * Riseup category auto-creation, and DB-driven category mapping.
 *
 * Extracted from the POST /api/budget/transactions/import handler
 * so it can be reused by the CSV upload endpoint.
 *
 * @throws On unrecoverable Prisma errors (callers should wrap in try/catch).
 */
export async function importTransactions(
  householdId: string,
  transactions: ImportTransactionInput[]
): Promise<ImportResult> {
  if (transactions.length === 0) {
    return { created: 0, duplicatesSkipped: 0, payeesCreated: [] };
  }
  // Fetch active payee category rules for auto-categorization of new payees
  const payeeCategoryRules = await prisma.payeeCategoryRule.findMany({
    where: { householdId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { operator: true, value: true, categoryId: true, isActive: true },
  });

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

  // Fetch existing transactions for duplicate detection (including soft-deleted ones
  // so that previously deleted transactions are not re-imported)
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

      // Apply payee category rules to newly created payees without a category
      if (!payeeInfo.categoryId && payeeCategoryRules.length > 0) {
        const matched = findMatchingRule(payeeCategoryRules, tx.payeeName.trim());
        if (matched) {
          try {
            await prisma.budgetPayee.update({
              where: { id: payeeInfo.id },
              data: { categoryId: matched.categoryId },
            });
            payeeInfo.categoryId = matched.categoryId;
          } catch (err) {
            console.warn('Failed to apply payee category rule:', err);
          }
        }
      }
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

  return { created, duplicatesSkipped, payeesCreated };
}
