import { NextRequest, NextResponse, after } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { getCycleRangeForHousehold } from '@/lib/utils/billing-cycle-server';
import { runReadTriggeredSuggestion } from '@/lib/ai/background-suggestion';

// Give the post-response read-triggered AI categorization pass room to run.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    // Activity-driven categorization: whenever the app checks the uncategorized
    // count (i.e. the user is looking at their budget), kick off a background
    // AI pass over any not-yet-attempted rows. This is the main automatic
    // driver on plans without a frequent cron. It runs after the response and
    // is self-limiting — once every row has been attempted it's a no-op.
    after(() => runReadTriggeredSuggestion(householdId));

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    const where: Prisma.BudgetTransactionWhereInput = {
      householdId,
      categoryId: null,
      type: 'expense',
      tags: { none: {} },
      isDeleted: false,
      OR: [{ payeeId: null }, { payee: { isBlacklisted: false } }],
    };

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json(
          { success: false, error: 'Invalid month format (YYYY-MM)' },
          { status: 400 }
        );
      }
      const { from, to } = await getCycleRangeForHousehold(householdId, month);
      where.transactionDate = { gte: from, lt: to };
    }

    const uncategorized = await prisma.budgetTransaction.count({ where });

    return NextResponse.json({ success: true, data: { uncategorized } });
  } catch (error) {
    console.error('Error fetching transaction counts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction counts' },
      { status: 500 }
    );
  }
}
