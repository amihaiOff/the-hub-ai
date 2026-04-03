import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateMonth(month: unknown): string | null {
  if (!month || typeof month !== 'string' || !MONTH_RE.test(month)) return null;
  return month;
}

function validateAmount(amount: unknown): number | null {
  if (
    amount == null ||
    typeof amount !== 'number' ||
    !isFinite(amount) ||
    amount <= 0 ||
    amount > 999999999
  )
    return null;
  return amount;
}

function parseMonthDates(month: string) {
  const [year, mon] = month.split('-').map(Number);
  return {
    startDate: new Date(year, mon - 1, 1),
    endDate: new Date(year, mon, 1),
  };
}

/**
 * Look up the "Savings" category for a household (read-only).
 */
async function findSavingsCategory(householdId: string) {
  return prisma.budgetCategory.findFirst({
    where: { householdId, name: 'Savings' },
    select: { id: true },
  });
}

/**
 * Find or auto-create the "Savings" category for a household.
 * Creates a "Savings" category group with a single "Savings" category (no budget).
 * Handles race conditions via unique constraint catch + retry.
 */
async function getOrCreateSavingsCategory(householdId: string) {
  const existing = await findSavingsCategory(householdId);
  if (existing) return existing.id;

  try {
    const group = await prisma.budgetCategoryGroup.create({
      data: { name: 'Savings', householdId, sortOrder: 999 },
    });

    const category = await prisma.budgetCategory.create({
      data: { name: 'Savings', groupId: group.id, householdId },
    });

    return category.id;
  } catch (error) {
    // Handle race condition — another request created it first
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const retried = await findSavingsCategory(householdId);
      if (retried) return retried.id;
    }
    throw error;
  }
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

    // Read-only lookup — don't create category on GET
    const existing = await findSavingsCategory(householdId);
    if (!existing) {
      return NextResponse.json({
        success: true,
        data: { categoryId: null, years: [] },
      });
    }
    const categoryId = existing.id;

    const transactions = await prisma.budgetTransaction.findMany({
      where: {
        householdId,
        categoryId,
        isDeleted: false,
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

    // Track which months have real transactions
    const monthsWithEntries = new Set(monthlyMap.keys());

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
    const yearMap = new Map<
      number,
      { month: string; amountCents: number; hasEntries: boolean }[]
    >();
    for (const [key, amountCents] of monthlyMap) {
      const year = parseInt(key.split('-')[0]);
      if (!yearMap.has(year)) yearMap.set(year, []);
      yearMap.get(year)!.push({ month: key, amountCents, hasEntries: monthsWithEntries.has(key) });
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
            hasEntries: m.hasEntries,
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

    const { month: rawMonth, amount: rawAmount } = body as { month?: string; amount?: number };

    const month = validateMonth(rawMonth);
    if (!month) {
      return NextResponse.json(
        { success: false, error: 'month is required (YYYY-MM format)' },
        { status: 400 }
      );
    }

    const amount = validateAmount(rawAmount);
    if (!amount) {
      return NextResponse.json(
        { success: false, error: 'amount must be a positive number (max 999,999,999)' },
        { status: 400 }
      );
    }

    const categoryId = await getOrCreateSavingsCategory(householdId);
    const { startDate } = parseMonthDates(month);

    const transaction = await prisma.budgetTransaction.create({
      data: {
        type: 'expense',
        transactionDate: startDate,
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

/**
 * PUT /api/budget/savings
 * Update a month's savings (replaces all transactions for that month with one)
 * Body: { month: "YYYY-MM", amount: number }
 */
export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();
    const { month: rawMonth, amount: rawAmount } = body as { month?: string; amount?: number };

    const month = validateMonth(rawMonth);
    if (!month) {
      return NextResponse.json(
        { success: false, error: 'month is required (YYYY-MM format)' },
        { status: 400 }
      );
    }

    const amount = validateAmount(rawAmount);
    if (!amount) {
      return NextResponse.json(
        { success: false, error: 'amount must be a positive number (max 999,999,999)' },
        { status: 400 }
      );
    }

    const existing = await findSavingsCategory(householdId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'No savings category found' },
        { status: 404 }
      );
    }
    const categoryId = existing.id;

    const { startDate, endDate } = parseMonthDates(month);

    // Atomic delete + create to prevent data loss on partial failure
    const transaction = await prisma.$transaction(async (tx) => {
      await tx.budgetTransaction.deleteMany({
        where: {
          householdId,
          categoryId,
          transactionDate: { gte: startDate, lt: endDate },
        },
      });

      return tx.budgetTransaction.create({
        data: {
          type: 'expense',
          transactionDate: startDate,
          amountIls: amount,
          amountOriginal: amount,
          currency: 'ILS',
          categoryId,
          source: 'manual',
          householdId,
        },
      });
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
    console.error('Error updating savings entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update savings entry' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/savings
 * Delete all savings transactions for a given month
 * Body: { month: "YYYY-MM" }
 */
export async function DELETE(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();
    const { month: rawMonth } = body as { month?: string };

    const month = validateMonth(rawMonth);
    if (!month) {
      return NextResponse.json(
        { success: false, error: 'month is required (YYYY-MM format)' },
        { status: 400 }
      );
    }

    const existing = await findSavingsCategory(householdId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'No savings category found' },
        { status: 404 }
      );
    }
    const categoryId = existing.id;

    const { startDate, endDate } = parseMonthDates(month);

    await prisma.budgetTransaction.deleteMany({
      where: {
        householdId,
        categoryId,
        transactionDate: { gte: startDate, lt: endDate },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting savings entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete savings entry' },
      { status: 500 }
    );
  }
}
