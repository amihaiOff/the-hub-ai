import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { analysisQuerySchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/budget/analysis
 * Get budget analysis data for a date range: monthly totals, group/category breakdowns, tag spending
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);

    const validation = analysisQuerySchema.safeParse({
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { startDate, endDate } = validation.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Fetch transactions and category groups in parallel
    const [transactions, categoryGroups] = await Promise.all([
      prisma.budgetTransaction.findMany({
        where: {
          householdId,
          transactionDate: { gte: start, lte: end },
          isSplit: false,
          excludedFromFlow: false,
        },
        select: {
          id: true,
          type: true,
          transactionDate: true,
          amountIls: true,
          categoryId: true,
          tags: {
            select: {
              tag: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
      }),
      prisma.budgetCategoryGroup.findMany({
        where: { householdId },
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    // Build month keys from actual transaction dates (avoids empty months for large "all time" ranges)
    const months: string[] = [];
    if (transactions.length > 0) {
      let minDate = transactions[0].transactionDate;
      let maxDate = transactions[0].transactionDate;
      for (const tx of transactions) {
        if (tx.transactionDate < minDate) minDate = tx.transactionDate;
        if (tx.transactionDate > maxDate) maxDate = tx.transactionDate;
      }
      const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      const endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
      while (cursor <= endMonth) {
        months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    const numMonths = months.length;

    // Build category-to-group lookup
    const categoryToGroup = new Map<string, string>();
    for (const group of categoryGroups) {
      for (const cat of group.categories) {
        categoryToGroup.set(cat.id, group.id);
      }
    }

    // Use integer cents to avoid floating-point accumulation errors
    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;

    // Aggregate monthly totals (in cents)
    const monthlyMap = new Map<string, { income: number; expenses: number }>();
    for (const m of months) {
      monthlyMap.set(m, { income: 0, expenses: 0 });
    }

    // Aggregate by category per month (in cents)
    const categoryMonthlySpent = new Map<string, Map<string, number>>();
    // Aggregate by tag (in cents)
    const tagData = new Map<
      string,
      {
        name: string;
        color: string;
        totalSpent: number;
        count: number;
        monthly: Map<string, number>;
      }
    >();

    for (const tx of transactions) {
      const txDate = tx.transactionDate;
      const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
      const amountCents = toCents(tx.amountIls);

      // Monthly totals
      const monthly = monthlyMap.get(monthKey);
      if (monthly) {
        if (tx.type === 'income') {
          monthly.income += amountCents;
        } else {
          monthly.expenses += amountCents;
        }
      }

      // Category monthly spent (expenses only)
      if (tx.type === 'expense' && tx.categoryId) {
        if (!categoryMonthlySpent.has(tx.categoryId)) {
          categoryMonthlySpent.set(tx.categoryId, new Map());
        }
        const catMonthly = categoryMonthlySpent.get(tx.categoryId)!;
        catMonthly.set(monthKey, (catMonthly.get(monthKey) ?? 0) + amountCents);
      }

      // Tag aggregation (expenses only)
      if (tx.type === 'expense') {
        for (const tt of tx.tags) {
          const tag = tt.tag;
          if (!tagData.has(tag.id)) {
            tagData.set(tag.id, {
              name: tag.name,
              color: tag.color,
              totalSpent: 0,
              count: 0,
              monthly: new Map(),
            });
          }
          const td = tagData.get(tag.id)!;
          td.totalSpent += amountCents;
          td.count += 1;
          td.monthly.set(monthKey, (td.monthly.get(monthKey) ?? 0) + amountCents);
        }
      }
    }

    // Compute total budgeted per month in cents (sum of all category budgets)
    const totalMonthlyBudgetCents = categoryGroups.reduce((sum, g) => {
      return sum + g.categories.reduce((s, c) => s + (c.budget ? toCents(c.budget) : 0), 0);
    }, 0);

    // Build monthlyTotals (convert cents back to currency)
    const monthlyTotals = months.map((m) => {
      const data = monthlyMap.get(m)!;
      return {
        month: m,
        totalIncome: fromCents(data.income),
        totalExpenses: fromCents(data.expenses),
        totalBudgeted: fromCents(totalMonthlyBudgetCents),
      };
    });

    // Build groups with nested categories (all values in cents, convert at output)
    const groups = categoryGroups.map((group) => {
      const categories = group.categories.map((cat) => {
        const catMonthly = categoryMonthlySpent.get(cat.id);
        const totalSpentCents = catMonthly
          ? Array.from(catMonthly.values()).reduce((s, v) => s + v, 0)
          : 0;
        const totalBudgetedCents = cat.budget ? toCents(cat.budget) * numMonths : 0;

        return {
          id: cat.id,
          name: cat.name,
          totalBudgeted: fromCents(totalBudgetedCents),
          totalSpent: fromCents(totalSpentCents),
          isMust: cat.isMust,
          monthlySpent: months.map((m) => ({
            month: m,
            spent: fromCents(catMonthly?.get(m) ?? 0),
          })),
        };
      });

      const totalGroupBudgeted = categories.reduce((s, c) => s + c.totalBudgeted, 0);
      const totalGroupSpent = categories.reduce((s, c) => s + c.totalSpent, 0);

      return {
        id: group.id,
        name: group.name,
        sortOrder: group.sortOrder,
        totalBudgeted: totalGroupBudgeted,
        totalSpent: totalGroupSpent,
        monthlySpent: months.map((m) => ({
          month: m,
          spent: categories.reduce((s, c) => {
            const cm = c.monthlySpent.find((ms) => ms.month === m);
            return s + (cm?.spent ?? 0);
          }, 0),
        })),
        categories,
      };
    });

    // Build tags (convert from cents at output)
    const tags = Array.from(tagData.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        color: data.color,
        totalSpent: fromCents(data.totalSpent),
        transactionCount: data.count,
        monthlySpent: months.map((m) => ({
          month: m,
          spent: fromCents(data.monthly.get(m) ?? 0),
        })),
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    return NextResponse.json({
      success: true,
      data: { monthlyTotals, groups, tags },
    });
  } catch (error) {
    console.error('Error fetching budget analysis:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch budget analysis' },
      { status: 500 }
    );
  }
}
