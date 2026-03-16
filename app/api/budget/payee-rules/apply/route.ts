import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { findMatchingRule } from '@/lib/utils/budget';

/**
 * POST /api/budget/payee-rules/apply
 * Bulk-apply all active rules to existing payees that have no default category.
 * Returns count of matched and total uncategorized payees.
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
        data: { matched: 0, total: 0 },
      });
    }

    // Fetch payees without a default category
    const uncategorizedPayees = await prisma.budgetPayee.findMany({
      where: { householdId, categoryId: null },
      select: { id: true, name: true },
    });

    // Group matched payees by categoryId for batched updates
    const updatesByCategory = new Map<string, string[]>();
    for (const payee of uncategorizedPayees) {
      const match = findMatchingRule(rules, payee.name);
      if (match) {
        const ids = updatesByCategory.get(match.categoryId) ?? [];
        ids.push(payee.id);
        updatesByCategory.set(match.categoryId, ids);
      }
    }

    let matched = 0;
    for (const [categoryId, payeeIds] of updatesByCategory) {
      await prisma.budgetPayee.updateMany({
        where: { id: { in: payeeIds } },
        data: { categoryId },
      });
      matched += payeeIds.length;
    }

    return NextResponse.json({
      success: true,
      data: { matched, total: uncategorizedPayees.length },
    });
  } catch (error) {
    console.error('Error applying payee category rules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply payee category rules' },
      { status: 500 }
    );
  }
}
