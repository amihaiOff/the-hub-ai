import { prisma } from '@/lib/db';
import type { ImportTransactionInput } from '@/lib/validations/budget';
import { findMatchingRule } from '@/lib/utils/budget';

export interface ImportResult {
  created: number;
  duplicatesSkipped: number;
  payeesCreated: string[];
}

const CC_DEDUP_WINDOW_DAYS = 5;

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
  // Fetch CC generic payee names configured by the household
  const ccGenericRows = await prisma.ccGenericPayeeName.findMany({
    where: { householdId },
    select: { name: true },
  });
  const ccGenericNames = new Set(ccGenericRows.map((r) => r.name.toLowerCase().trim()));

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

  // Fetch all existing payees for the household. We deliberately include
  // blacklisted ones in the lookup: payee name has a unique constraint per
  // household, so if a blacklisted payee with the same name exists we must
  // re-use it (or the create call would crash). The transaction will then be
  // automatically hidden everywhere because the read-side filter excludes
  // transactions linked to a blacklisted payee.
  const existingPayees = await prisma.budgetPayee.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      categoryId: true,
      neverDefault: true,
      isBlacklisted: true,
    },
  });

  // Build case-insensitive lookup map
  const payeeLookup = new Map<
    string,
    { id: string; categoryId: string | null; neverDefault: boolean; isBlacklisted: boolean }
  >();
  for (const p of existingPayees) {
    payeeLookup.set(p.name.toLowerCase().trim(), {
      id: p.id,
      categoryId: p.categoryId,
      neverDefault: p.neverDefault,
      isBlacklisted: p.isBlacklisted,
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

  // When CC generic names are configured, expand the window to catch matches
  // that fall just outside the import batch's natural date range.
  const windowMs = ccGenericNames.size > 0 ? CC_DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000 : 0;
  const queryMinDate = new Date(new Date(minDate).getTime() - windowMs);
  const queryMaxDate = new Date(new Date(maxDate).getTime() + windowMs);

  const existingTransactions = await prisma.budgetTransaction.findMany({
    where: {
      householdId,
      transactionDate: {
        gte: queryMinDate,
        lte: queryMaxDate,
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

  // Build amount-keyed maps for CC generic dedup (only when feature is in use)
  // genericByAmount: amount → list of {id, date} for existing CC-generic transactions
  // nonGenericByAmount: amount → list of {date} for existing non-generic transactions
  const genericByAmount = new Map<string, { id: string; date: Date }[]>();
  const nonGenericByAmount = new Map<string, { date: Date }[]>();
  if (ccGenericNames.size > 0) {
    for (const tx of existingTransactions) {
      const amtKey = Number(tx.amountIls).toFixed(2);
      const payeeLower = tx.payee?.name?.toLowerCase().trim() ?? '';
      if (ccGenericNames.has(payeeLower)) {
        const arr = genericByAmount.get(amtKey) ?? [];
        arr.push({ id: tx.id, date: tx.transactionDate });
        genericByAmount.set(amtKey, arr);
      } else {
        const arr = nonGenericByAmount.get(amtKey) ?? [];
        arr.push({ date: tx.transactionDate });
        nonGenericByAmount.set(amtKey, arr);
      }
    }
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

    // CC generic dedup: only runs when the household has generic names configured
    if (ccGenericNames.size > 0) {
      const amtKey = tx.amountIls.toFixed(2);
      const txDate = new Date(tx.transactionDate);

      if (ccGenericNames.has(payeeNameLower)) {
        // Scenario A: incoming transaction IS generic — skip if a non-generic with same
        // amount already exists within the dedup window.
        const candidates = nonGenericByAmount.get(amtKey) ?? [];
        const hasMatch = candidates.some(
          (c) => Math.abs(c.date.getTime() - txDate.getTime()) <= windowMs
        );
        if (hasMatch) {
          duplicatesSkipped++;
          continue;
        }
      } else {
        // Scenario B: incoming transaction is NOT generic — soft-delete any existing
        // generic transaction with the same amount within the dedup window.
        const candidates = genericByAmount.get(amtKey) ?? [];
        const toDelete = candidates.filter(
          (c) => Math.abs(c.date.getTime() - txDate.getTime()) <= windowMs
        );
        if (toDelete.length > 0) {
          const ids = toDelete.map((c) => c.id);
          await prisma.budgetTransaction.updateMany({
            where: { id: { in: ids } },
            data: { isDeleted: true },
          });
          // Remove from map so within-batch duplicates don't match again
          const remaining = candidates.filter((c) => !ids.includes(c.id));
          if (remaining.length > 0) {
            genericByAmount.set(amtKey, remaining);
          } else {
            genericByAmount.delete(amtKey);
          }
        }
      }
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
        payeeInfo = {
          id: newPayee.id,
          categoryId: null,
          neverDefault: false,
          isBlacklisted: false,
        };
        payeesCreated.push(tx.payeeName.trim());
      } catch {
        // Handle unique constraint violation (concurrent import). Pull the
        // existing row including its blacklist flag so we don't try to mutate
        // a payee the user has explicitly hidden.
        const existing = await prisma.budgetPayee.findFirst({
          where: { householdId, name: tx.payeeName.trim() },
          select: { id: true, categoryId: true, neverDefault: true, isBlacklisted: true },
        });
        if (existing) {
          payeeInfo = {
            id: existing.id,
            categoryId: existing.categoryId,
            neverDefault: existing.neverDefault,
            isBlacklisted: existing.isBlacklisted,
          };
        } else {
          throw new Error(`Failed to create or find payee: ${tx.payeeName.trim()}`);
        }
      }
      payeeLookup.set(payeeNameLower, payeeInfo);

      // Apply payee category rules to newly created payees without a category,
      // unless the payee is already marked neverDefault — and skip blacklisted
      // payees entirely since the user has hidden them from the app.
      if (
        !payeeInfo.categoryId &&
        !payeeInfo.neverDefault &&
        !payeeInfo.isBlacklisted &&
        payeeCategoryRules.length > 0
      ) {
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

      // Set payee default category from Riseup mapping if payee has no default yet,
      // and the payee is not marked neverDefault.
      // and the payee is not blacklisted (we don't touch hidden payees).
      if (
        categoryId &&
        !payeeInfo.categoryId &&
        !payeeInfo.neverDefault &&
        !payeeInfo.isBlacklisted
      ) {
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

    // Keep within-batch CC dedup maps current
    if (ccGenericNames.size > 0) {
      const amtKey = tx.amountIls.toFixed(2);
      const txDate = new Date(tx.transactionDate);
      if (ccGenericNames.has(payeeNameLower)) {
        const arr = genericByAmount.get(amtKey) ?? [];
        // We only reach here if this generic was NOT skipped (no match found)
        // so it shouldn't block a future non-generic, but track it anyway
        arr.push({ id: '', date: txDate });
        genericByAmount.set(amtKey, arr);
      } else {
        const arr = nonGenericByAmount.get(amtKey) ?? [];
        arr.push({ date: txDate });
        nonGenericByAmount.set(amtKey, arr);
      }
    }

    created++;
  }

  return { created, duplicatesSkipped, payeesCreated };
}
