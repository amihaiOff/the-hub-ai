import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { matchesPayeeRule, type RuleOperator } from '@/lib/utils/budget';

/**
 * POST /api/budget/payee-rules/[id]/apply
 * Apply a single rule to existing uncategorized payees.
 * Returns count of matched and total uncategorized payees.
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

    // Fetch payees without a default category
    const uncategorizedPayees = await prisma.budgetPayee.findMany({
      where: { householdId, categoryId: null },
      select: { id: true, name: true },
    });

    // Find payees matching this rule
    const matchedIds: string[] = [];
    for (const payee of uncategorizedPayees) {
      if (matchesPayeeRule(payee.name, rule.operator as RuleOperator, rule.value)) {
        matchedIds.push(payee.id);
      }
    }

    if (matchedIds.length > 0) {
      await prisma.budgetPayee.updateMany({
        where: { id: { in: matchedIds } },
        data: { categoryId: rule.categoryId },
      });
    }

    return NextResponse.json({
      success: true,
      data: { matched: matchedIds.length, total: uncategorizedPayees.length },
    });
  } catch (error) {
    console.error('Error applying payee category rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply payee category rule' },
      { status: 500 }
    );
  }
}
