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
    select: {
      operator: true,
      value: true,
      categoryId: true,
      markNeverDefault: true,
      isActive: true,
    },
  });

  // Fetch all existing payees for the household
  const existingPayees = await prisma.budgetPayee.findMany({
    where: { householdId },
    select: { id: true, name: true, categoryId: true, neverDefault: true },
  });

  // Build case-insensitive lookup map
  const payeeLookup = new Map<
    string,
    { id: string; categoryId: string | null; neverDefault: boolean }
  >();
  for (const p of existingPayees) {
    payeeLookup.set(p.name.toLowerCase().trim(), {
      id: p.id,
      categoryId: p.categoryId,
      neverDefault: p.neverDefault,
    });
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

  // Auto-create new Riseup categories in parallel batches
  const BATCH_SIZE = 5;
  const newRiseupNames = Array.from(newRiseupCategoryNames);
  for (let i = 0; i < newRiseupNames.length; i += BATCH_SIZE) {
    await Promise.all(
      newRiseupNames.slice(i, i + BATCH_SIZE).map(async (name) => {
        try {
          await prisma.riseupCategory.create({
            data: { name, householdId },
          });
          knownRiseupNames.add(name);
          riseupMapping.set(name, null); // No mapping yet
        } catch {
          // Ignore unique constraint violations (concurrent imports)
        }
      })
    );
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

  // Build duplicate detection set (use toFixed(2) for consistent decimal comparison).
  // Also map each (date|payee|amount) key to the existing row id + moneytorId, so the
  // Moneytor sync path can back-stamp `moneytorId` onto a pre-existing CSV row instead
  // of creating a duplicate.
  const existingKeys = new Set<string>();
  const existingByKey = new Map<string, { id: string; moneytorId: string | null }>();
  const existingMoneytorIds = new Set<string>();
  for (const tx of existingTransactions) {
    const payeeName = tx.payee?.name?.toLowerCase().trim() ?? '';
    const key = `${tx.transactionDate.toISOString().split('T')[0]}|${payeeName}|${Number(tx.amountIls).toFixed(2)}`;
    existingKeys.add(key);
    existingByKey.set(key, { id: tx.id, moneytorId: tx.moneytorId });
    if (tx.moneytorId) existingMoneytorIds.add(tx.moneytorId);
  }

  // Also pre-check moneytorId hits OUTSIDE the date window — re-runs of sync after a
  // backdated transaction was already promoted need to skip it even if the
  // transactionDate has drifted.
  const batchMoneytorIds = transactions
    .map((t) => t.moneytorId)
    .filter((id): id is string => Boolean(id));
  if (batchMoneytorIds.length > 0) {
    const outOfWindow = await prisma.budgetTransaction.findMany({
      where: { householdId, moneytorId: { in: batchMoneytorIds } },
      select: { moneytorId: true },
    });
    for (const row of outOfWindow) {
      if (row.moneytorId) existingMoneytorIds.add(row.moneytorId);
    }
  }

  let created = 0;
  let duplicatesSkipped = 0;
  const payeesCreated: string[] = [];

  for (const tx of transactions) {
    const payeeNameLower = tx.payeeName.toLowerCase().trim();

    // Moneytor sync path: if this row was already promoted (matching moneytorId in
    // budget_transactions), skip it cleanly.
    if (tx.moneytorId && existingMoneytorIds.has(tx.moneytorId)) {
      duplicatesSkipped++;
      continue;
    }

    // Check for duplicate (use toFixed(2) for consistent precision)
    const dupKey = `${tx.transactionDate}|${payeeNameLower}|${tx.amountIls.toFixed(2)}`;
    if (existingKeys.has(dupKey)) {
      duplicatesSkipped++;
      // If the duplicate came from CSV/manual entry but this incoming row carries a
      // moneytorId, stamp it onto the existing row so the next sync recognises it
      // and doesn't keep retrying. Only stamp when the existing row has no moneytorId.
      if (tx.moneytorId) {
        const existing = existingByKey.get(dupKey);
        if (existing && !existing.moneytorId) {
          try {
            await prisma.budgetTransaction.update({
              where: { id: existing.id },
              data: { moneytorId: tx.moneytorId },
            });
            existing.moneytorId = tx.moneytorId;
            existingMoneytorIds.add(tx.moneytorId);
          } catch (err) {
            // Unique-constraint race: the moneytorId was just stamped elsewhere — fine.
            console.warn('Failed to back-stamp moneytorId on existing row:', err);
          }
        }
      }
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
        payeeInfo = { id: newPayee.id, categoryId: null, neverDefault: false };
        payeesCreated.push(tx.payeeName.trim());
      } catch {
        // Handle unique constraint violation (concurrent import)
        const existing = await prisma.budgetPayee.findFirst({
          where: { householdId, name: tx.payeeName.trim() },
          select: { id: true, categoryId: true, neverDefault: true },
        });
        if (existing) {
          payeeInfo = {
            id: existing.id,
            categoryId: existing.categoryId,
            neverDefault: existing.neverDefault,
          };
        } else {
          throw new Error(`Failed to create or find payee: ${tx.payeeName.trim()}`);
        }
      }
      payeeLookup.set(payeeNameLower, payeeInfo);

      // Apply payee category rules to newly created payees without a category,
      // unless the payee is already marked neverDefault.
      if (!payeeInfo.categoryId && !payeeInfo.neverDefault && payeeCategoryRules.length > 0) {
        const matched = findMatchingRule(payeeCategoryRules, tx.payeeName.trim());
        if (matched) {
          try {
            if (matched.markNeverDefault) {
              await prisma.budgetPayee.update({
                where: { id: payeeInfo.id },
                data: { neverDefault: true, categoryId: null },
              });
              payeeInfo.neverDefault = true;
              payeeInfo.categoryId = null;
            } else if (matched.categoryId) {
              await prisma.budgetPayee.update({
                where: { id: payeeInfo.id },
                data: { categoryId: matched.categoryId },
              });
              payeeInfo.categoryId = matched.categoryId;
            }
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
      // and the payee is not marked neverDefault.
      if (categoryId && !payeeInfo.categoryId && !payeeInfo.neverDefault) {
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
        moneytorId: tx.moneytorId ?? null,
      },
    });

    // Add to existing keys to prevent duplicates within the same batch
    existingKeys.add(dupKey);
    if (tx.moneytorId) existingMoneytorIds.add(tx.moneytorId);
    created++;
  }

  return { created, duplicatesSkipped, payeesCreated };
}
