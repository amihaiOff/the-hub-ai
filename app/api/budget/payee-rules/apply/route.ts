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
      select: { operator: true, value: true, categoryId: true, isActive: true },
    });

    if (rules.length === 0) {
      return NextResponse.json({
        success: true,
        data: { matched: 0, total: 0, transactionsUpdated: 0 },
      });
    }

    // Fetch all payees (not just uncategorized) to match against
    const allPayees = await prisma.budgetPayee.findMany({
      where: { householdId },
      select: { id: true, name: true },
    });

    // Group matched payees by categoryId for batched updates
    const updatesByCategory = new Map<string, string[]>();
    for (const payee of allPayees) {
      const match = findMatchingRule(rules, payee.name);
      if (match) {
        const ids = updatesByCategory.get(match.categoryId) ?? [];
        ids.push(payee.id);
        updatesByCategory.set(match.categoryId, ids);
      }
    }

    let matched = 0;
    let transactionsUpdated = 0;
    for (const [categoryId, payeeIds] of updatesByCategory) {
      // Update payee default categories
      await prisma.budgetPayee.updateMany({
        where: { id: { in: payeeIds }, householdId },
        data: { categoryId },
      });
      matched += payeeIds.length;

      // Also update existing transactions for matched payees
      const txResult = await prisma.budgetTransaction.updateMany({
        where: { payeeId: { in: payeeIds }, householdId },
        data: { categoryId },
      });
      transactionsUpdated += txResult.count;
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
