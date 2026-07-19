import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { summaryQuerySchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { getMonthTransactionWhereForHousehold } from '@/lib/utils/billing-cycle-server';

/**
 * GET /api/budget/summary
 * Get monthly budget summary with spending by category
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);

    const validation = summaryQuerySchema.safeParse({
      month: searchParams.get('month'),
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { month } = validation.data;

    // The month window is payment-method-aware: credit cards use the household
    // billing cycle, bank/other use the calendar month. Merged via AND below so
    // it composes with the payee-blacklist OR (the fragment carries its own OR).
    const monthWhere = await getMonthTransactionWhereForHousehold(householdId, month);

    // Fetch category groups and transactions in parallel (no dependency between them)
    const [categoryGroups, transactions] = await Promise.all([
      prisma.budgetCategoryGroup.findMany({
        where: { householdId },
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.budgetTransaction.findMany({
        where: {
          householdId,
          // Payment-method-aware month window (credit cards = billing cycle,
          // bank/other = calendar month). AND-wrapped so its OR coexists with
          // the payee-blacklist OR below.
          AND: [monthWhere],
          // Exclude split parent transactions (only count children)
          isSplit: false,
          // Exclude transactions marked as excluded from budget flow
          excludedFromFlow: false,
          isDeleted: false,
          // Hide transactions whose payee is blacklisted (but keep those with no payee).
          OR: [{ payeeId: null }, { payee: { isBlacklisted: false } }],
        },
        select: {
          id: true,
          type: true,
          transactionDate: true,
          amountIls: true,
          categoryId: true,
          payeeId: true,
          paymentMethod: true,
          notes: true,
          payee: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    // Calculate totals
    const incomeTransactions = transactions.filter((tx) => tx.type === 'income');
    const expenseTransactions = transactions.filter((tx) => tx.type === 'expense');

    const totalIncome = incomeTransactions.reduce((sum, tx) => sum + Number(tx.amountIls), 0);
    const totalSpent = expenseTransactions.reduce((sum, tx) => sum + Number(tx.amountIls), 0);

    // Build category spending map
    const categorySpendingMap = new Map<
      string,
      {
        spent: number;
        transactions: typeof transactions;
      }
    >();

    for (const tx of expenseTransactions) {
      const categoryId = tx.categoryId ?? 'uncategorized';
      const existing = categorySpendingMap.get(categoryId) ?? { spent: 0, transactions: [] };
      existing.spent += Number(tx.amountIls);
      existing.transactions.push(tx);
      categorySpendingMap.set(categoryId, existing);
    }

    // Build response
    const categoryGroupSummaries = categoryGroups.map((group) => {
      const categorySpending = group.categories.map((category) => {
        const spending = categorySpendingMap.get(category.id);
        const budgeted = category.budget ? Number(category.budget) : 0;
        const spent = spending?.spent ?? 0;

        return {
          categoryId: category.id,
          categoryName: category.name,
          groupId: group.id,
          groupName: group.name,
          budgeted,
          spent,
          available: budgeted - spent,
          isMust: category.isMust,
          transactions: (spending?.transactions ?? []).map((tx) => ({
            id: tx.id,
            type: tx.type,
            transactionDate: tx.transactionDate.toISOString().split('T')[0],
            amountIls: Number(tx.amountIls),
            categoryId: tx.categoryId,
            payeeId: tx.payeeId,
            payeeName: tx.payee?.name ?? null,
            paymentMethod: tx.paymentMethod,
            notes: tx.notes,
          })),
        };
      });

      const totalGroupBudgeted = categorySpending.reduce((sum, c) => sum + c.budgeted, 0);
      const totalGroupSpent = categorySpending.reduce((sum, c) => sum + c.spent, 0);

      return {
        id: group.id,
        name: group.name,
        sortOrder: group.sortOrder,
        totalBudgeted: totalGroupBudgeted,
        totalSpent: totalGroupSpent,
        totalAvailable: totalGroupBudgeted - totalGroupSpent,
        categories: categorySpending,
      };
    });

    // Add uncategorized spending if any
    const uncategorizedSpending = categorySpendingMap.get('uncategorized');
    if (uncategorizedSpending) {
      categoryGroupSummaries.push({
        id: 'uncategorized',
        name: 'Uncategorized',
        sortOrder: 9999,
        totalBudgeted: 0,
        totalSpent: uncategorizedSpending.spent,
        totalAvailable: -uncategorizedSpending.spent,
        categories: [
          {
            categoryId: 'uncategorized',
            categoryName: 'Uncategorized',
            groupId: 'uncategorized',
            groupName: 'Uncategorized',
            budgeted: 0,
            spent: uncategorizedSpending.spent,
            available: -uncategorizedSpending.spent,
            isMust: false,
            transactions: uncategorizedSpending.transactions.map((tx) => ({
              id: tx.id,
              type: tx.type,
              transactionDate: tx.transactionDate.toISOString().split('T')[0],
              amountIls: Number(tx.amountIls),
              categoryId: tx.categoryId,
              payeeId: tx.payeeId,
              payeeName: tx.payee?.name ?? null,
              paymentMethod: tx.paymentMethod,
              notes: tx.notes,
            })),
          },
        ],
      });
    }

    const totalBudgeted = categoryGroupSummaries.reduce((sum, g) => sum + g.totalBudgeted, 0);

    return NextResponse.json({
      success: true,
      data: {
        month,
        totalBudgeted,
        totalSpent,
        totalIncome,
        categoryGroups: categoryGroupSummaries,
      },
    });
  } catch (error) {
    console.error('Error fetching budget summary:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch budget summary' },
      { status: 500 }
    );
  }
}
