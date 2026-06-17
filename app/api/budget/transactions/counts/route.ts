import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { getCycleRangeForHousehold } from '@/lib/utils/billing-cycle-server';

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
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
