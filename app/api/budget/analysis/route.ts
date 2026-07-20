import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { analysisQuerySchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { getMonthTransactionWhereForHousehold } from '@/lib/utils/billing-cycle-server';

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

    // Two modes:
    //  - month=YYYY-MM: a single budget month, payment-method-aware (credit
    //    cards use the billing cycle, everything else the calendar month).
    //    Every matched transaction is bucketed into that one month.
    //  - startDate/endDate: an arbitrary calendar range, bucketed by calendar
    //    month (the trend view). No cycle split.
    const monthParam = searchParams.get('month');
    let txDateWhere: Prisma.BudgetTransactionWhereInput;
    if (monthParam !== null) {
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return NextResponse.json(
          { success: false, error: 'Invalid month format (YYYY-MM)' },
          { status: 400 }
        );
      }
      // AND-wrapped so its inner OR (cc-window vs calendar-window) composes with
      // the payee-blacklist OR below.
      txDateWhere = { AND: [await getMonthTransactionWhereForHousehold(householdId, monthParam)] };
    } else {
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
      txDateWhere = {
        transactionDate: {
          gte: new Date(validation.data.startDate),
          lte: new Date(validation.data.endDate),
        },
      };
    }

    // Fetch transactions, category groups, and friendly account names in parallel.
    // The account-name map turns raw payment_identifier values into recognizable
    // labels (e.g. "Max card 2717") for the institution breakdown panel.
    const [transactions, categoryGroups, accountNames] = await Promise.all([
      prisma.budgetTransaction.findMany({
        where: {
          householdId,
          ...txDateWhere,
          isSplit: false,
          excludedFromFlow: false,
          isDeleted: false,
          OR: [{ payeeId: null }, { payee: { isBlacklisted: false } }],
        },
        select: {
          id: true,
          type: true,
          transactionDate: true,
          amountIls: true,
          categoryId: true,
          paymentMethod: true,
          paymentIdentifier: true,
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
      prisma.budgetAccountName.findMany({
        where: { householdId },
        select: { accountNumber: true, name: true },
      }),
    ]);
    const accountNameMap = new Map(accountNames.map((a) => [a.accountNumber, a.name]));

    // In month mode every matched transaction belongs to the one selected
    // month (a credit-card charge dated in the next calendar month still counts
    // under the selected cycle). Its calendar date is otherwise irrelevant.
    const calendarKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthKeyOf = (d: Date) => monthParam ?? calendarKey(d);

    // Build month keys. In month mode it's the single selected month; in range
    // mode, derive from actual transaction dates (avoids empty months for large
    // "all time" ranges).
    const months: string[] = [];
    if (monthParam !== null) {
      months.push(monthParam);
    } else if (transactions.length > 0) {
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

    // Aggregate by institution (payment identifier + method). Falls back to
    // `unmapped:<method>` when payment_identifier is missing so we still
    // report a coarse Credit-cards / Bank-transfer split.
    const institutionData = new Map<
      string,
      {
        name: string;
        paymentMethod: 'credit_card' | 'bank_transfer';
        totalSpent: number;
        count: number;
      }
    >();

    for (const tx of transactions) {
      const monthKey = monthKeyOf(tx.transactionDate);
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

      // Institution aggregation (expenses only). Use the raw
      // payment_identifier as the grouping key so multiple charges on the
      // same card collapse into one row; look up the friendly name via
      // BudgetAccountName. Transactions without an identifier fall into
      // the coarse `unmapped:<method>` bucket.
      if (tx.type === 'expense') {
        const method = tx.paymentMethod as 'credit_card' | 'bank_transfer';
        const id = tx.paymentIdentifier ?? `unmapped:${method}`;
        const friendly = tx.paymentIdentifier
          ? (accountNameMap.get(tx.paymentIdentifier) ?? `Card ${tx.paymentIdentifier}`)
          : method === 'credit_card'
            ? 'Credit card (unmapped)'
            : 'Bank (unmapped)';
        const entry = institutionData.get(id);
        if (entry) {
          entry.totalSpent += amountCents;
          entry.count += 1;
        } else {
          institutionData.set(id, {
            name: friendly,
            paymentMethod: method,
            totalSpent: amountCents,
            count: 1,
          });
        }
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

    const institutions = Array.from(institutionData.entries())
      .map(([id, d]) => ({
        id,
        name: d.name,
        paymentMethod: d.paymentMethod,
        totalSpent: fromCents(d.totalSpent),
        transactionCount: d.count,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    return NextResponse.json({
      success: true,
      data: { monthlyTotals, groups, tags, institutions },
    });
  } catch (error) {
    console.error('Error fetching budget analysis:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch budget analysis' },
      { status: 500 }
    );
  }
}
