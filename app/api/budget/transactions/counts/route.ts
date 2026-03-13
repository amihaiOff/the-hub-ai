import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    const where: {
      householdId: string;
      categoryId: null;
      type: 'expense';
      tags?: { none: Record<string, never> };
      transactionDate?: { gte: Date; lt: Date };
    } = {
      householdId,
      categoryId: null,
      type: 'expense',
      tags: { none: {} },
    };

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json(
          { success: false, error: 'Invalid month format (YYYY-MM)' },
          { status: 400 }
        );
      }
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 1);
      where.transactionDate = { gte: startDate, lt: endDate };
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
