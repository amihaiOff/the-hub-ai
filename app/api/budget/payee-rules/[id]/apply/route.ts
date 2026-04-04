import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { matchesPayeeRule, type RuleOperator } from '@/lib/utils/budget';

/**
 * POST /api/budget/payee-rules/[id]/apply
 * Apply a single rule to existing payees and their transactions.
 * Updates payee default category AND re-categorizes existing transactions.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { id } = await params;

    // Fetch the rule and verify it belongs to household
    const rule = await prisma.payeeCategoryRule.findFirst({
      where: { id, householdId },
      select: { operator: true, value: true, categoryId: true, isActive: true },
    });

    if (!rule) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }

    if (!rule.isActive) {
      return NextResponse.json({ success: false, error: 'Rule is not active' }, { status: 400 });
    }

    // Fetch all payees (not just uncategorized) to match against
    const allPayees = await prisma.budgetPayee.findMany({
      where: { householdId },
      select: { id: true, name: true },
    });

    // Find payees matching this rule
    const matchedIds: string[] = [];
    for (const payee of allPayees) {
      if (matchesPayeeRule(payee.name, rule.operator as RuleOperator, rule.value)) {
        matchedIds.push(payee.id);
      }
    }

    const BATCH_SIZE = 5;
    let transactionsUpdated = 0;
    if (matchedIds.length > 0) {
      // Update payee default categories in parallel batches
      // Note: Using individual update() calls instead of updateMany() due to
      // Neon poolQueryViaFetch compatibility (updateMany silently fails like createMany)
      for (let i = 0; i < matchedIds.length; i += BATCH_SIZE) {
        await Promise.all(
          matchedIds.slice(i, i + BATCH_SIZE).map((payeeId) =>
            prisma.budgetPayee.update({
              where: { id: payeeId },
              data: { categoryId: rule.categoryId },
            })
          )
        );
      }

      // Also update existing non-deleted transactions for matched payees
      const txsToUpdate = await prisma.budgetTransaction.findMany({
        where: { payeeId: { in: matchedIds }, householdId, isDeleted: false },
        select: { id: true },
      });
      for (let i = 0; i < txsToUpdate.length; i += BATCH_SIZE) {
        await Promise.all(
          txsToUpdate.slice(i, i + BATCH_SIZE).map((tx) =>
            prisma.budgetTransaction.update({
              where: { id: tx.id },
              data: { categoryId: rule.categoryId },
            })
          )
        );
      }
      transactionsUpdated = txsToUpdate.length;
    }

    return NextResponse.json({
      success: true,
      data: { matched: matchedIds.length, total: allPayees.length, transactionsUpdated },
    });
  } catch (error) {
    console.error('Error applying payee category rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply payee category rule' },
      { status: 500 }
    );
  }
}
