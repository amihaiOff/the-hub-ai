import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { findMatchingRule } from '@/lib/utils/budget';

/**
 * POST /api/budget/payee-rules/apply
 * Bulk-apply all active rules to existing payees and their transactions.
 * Updates payee default categories AND re-categorizes existing transactions.
 */
export async function POST() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    // Fetch active rules ordered by priority
    const rules = await prisma.payeeCategoryRule.findMany({
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

    if (rules.length === 0) {
      return NextResponse.json({
        success: true,
        data: { matched: 0, total: 0, transactionsUpdated: 0 },
      });
    }

    // Fetch all payees (not just uncategorized) to match against. Blacklisted
    // payees are deliberately skipped — the user has hidden them.
    const allPayees = await prisma.budgetPayee.findMany({
      where: { householdId, isBlacklisted: false },
      select: { id: true, name: true },
    });

    // Split matched payees by mode: category assignment vs. never-default flagging.
    const updatesByCategory = new Map<string, string[]>();
    const neverDefaultPayeeIds: string[] = [];
    for (const payee of allPayees) {
      const match = findMatchingRule(rules, payee.name);
      if (!match) continue;
      if (match.markNeverDefault) {
        neverDefaultPayeeIds.push(payee.id);
      } else if (match.categoryId) {
        const ids = updatesByCategory.get(match.categoryId) ?? [];
        ids.push(payee.id);
        updatesByCategory.set(match.categoryId, ids);
      }
    }

    const BATCH_SIZE = 5;
    let matched = 0;
    let transactionsUpdated = 0;

    // Apply never-default flag to matched payees (and clear any existing
    // category default). Transactions are NOT bulk-updated for this mode —
    // the flag only affects future behaviour.
    for (let i = 0; i < neverDefaultPayeeIds.length; i += BATCH_SIZE) {
      await Promise.all(
        neverDefaultPayeeIds.slice(i, i + BATCH_SIZE).map((payeeId) =>
          prisma.budgetPayee.update({
            where: { id: payeeId },
            data: { neverDefault: true, categoryId: null },
          })
        )
      );
    }
    matched += neverDefaultPayeeIds.length;

    for (const [categoryId, payeeIds] of updatesByCategory) {
      // Update payee default categories in parallel batches
      // Note: Using individual update() calls instead of updateMany() due to
      // Neon poolQueryViaFetch compatibility (updateMany silently fails like createMany)
      for (let i = 0; i < payeeIds.length; i += BATCH_SIZE) {
        await Promise.all(
          payeeIds.slice(i, i + BATCH_SIZE).map((payeeId) =>
            prisma.budgetPayee.update({
              where: { id: payeeId },
              data: { categoryId },
            })
          )
        );
      }
      matched += payeeIds.length;

      // Also update existing non-deleted transactions for matched payees
      const txsToUpdate = await prisma.budgetTransaction.findMany({
        where: { payeeId: { in: payeeIds }, householdId, isDeleted: false },
        select: { id: true },
      });
      for (let i = 0; i < txsToUpdate.length; i += BATCH_SIZE) {
        await Promise.all(
          txsToUpdate.slice(i, i + BATCH_SIZE).map((tx) =>
            prisma.budgetTransaction.update({
              where: { id: tx.id },
              data: { categoryId },
            })
          )
        );
      }
      transactionsUpdated += txsToUpdate.length;
    }

    return NextResponse.json({
      success: true,
      data: { matched, total: allPayees.length, transactionsUpdated },
    });
  } catch (error) {
    console.error('Error applying payee category rules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply payee category rules' },
      { status: 500 }
    );
  }
}
