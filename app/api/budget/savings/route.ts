import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * Find or auto-create the "Savings" category for a household.
 * Creates a "Savings" category group with a single "Savings" category (no budget).
 */
async function getOrCreateSavingsCategory(householdId: string) {
  // Look up existing category by name
  const existing = await prisma.budgetCategory.findFirst({
    where: {
      householdId,
      name: 'Savings',
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  // Create group + category
  const group = await prisma.budgetCategoryGroup.create({
    data: {
      name: 'Savings',
      householdId,
      sortOrder: 999,
    },
  });

  const category = await prisma.budgetCategory.create({
    data: {
      name: 'Savings',
      groupId: group.id,
      householdId,
    },
  });

  return category.id;
}

/**
 * GET /api/budget/savings
 * Returns monthly savings data grouped by year
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const categoryId = await getOrCreateSavingsCategory(householdId);

    const transactions = await prisma.budgetTransaction.findMany({
      where: {
        householdId,
        categoryId,
      },
      select: {
        transactionDate: true,
        amountIls: true,
      },
      orderBy: { transactionDate: 'desc' },
    });

    // Integer cents to avoid floating-point errors
    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;

    // Aggregate by month
    const monthlyMap = new Map<string, number>();
    for (const tx of transactions) {
      const d = tx.transactionDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + toCents(tx.amountIls));
    }

    // Fill missing months from first savings month to current month
    if (monthlyMap.size > 0) {
      const keys = Array.from(monthlyMap.keys()).sort();
      const [firstYear, firstMonth] = keys[0].split('-').map(Number);
      const now = new Date();
      const cursor = new Date(firstYear, firstMonth - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);

      while (cursor <= end) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyMap.has(key)) {
          monthlyMap.set(key, 0);
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Group by year
    const yearMap = new Map<number, { month: string; amountCents: number }[]>();
    for (const [key, amountCents] of monthlyMap) {
      const year = parseInt(key.split('-')[0]);
      if (!yearMap.has(year)) yearMap.set(year, []);
      yearMap.get(year)!.push({ month: key, amountCents });
    }

    // Build response: years desc, months Jan→Dec within each year
    const years = Array.from(yearMap.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, months]) => {
        months.sort((a, b) => a.month.localeCompare(b.month));
        const totalCents = months.reduce((sum, m) => sum + m.amountCents, 0);
        return {
          year,
          total: fromCents(totalCents),
          months: months.map((m) => ({
            month: m.month,
            amount: fromCents(m.amountCents),
          })),
        };
      });

    return NextResponse.json({
      success: true,
      data: { categoryId, years },
    });
  } catch (error) {
    console.error('Error fetching savings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch savings data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/savings
 * Create a savings transaction
 * Body: { month: "YYYY-MM", amount: number }
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();

    const { month, amount } = body as { month?: string; amount?: number };

    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: 'month is required (YYYY-MM format)' },
        { status: 400 }
      );
    }

    if (amount == null || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'amount must be a positive number' },
        { status: 400 }
      );
    }

    const categoryId = await getOrCreateSavingsCategory(householdId);

    const transaction = await prisma.budgetTransaction.create({
      data: {
        type: 'expense',
        transactionDate: new Date(`${month}-01`),
        amountIls: amount,
        amountOriginal: amount,
        currency: 'ILS',
        categoryId,
        source: 'manual',
        householdId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: transaction.id,
        month,
        amount: Number(transaction.amountIls),
      },
    });
  } catch (error) {
    console.error('Error creating savings entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create savings entry' },
      { status: 500 }
    );
  }
}
