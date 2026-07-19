import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createTransactionSchema, transactionFiltersSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { getMonthTransactionWhereForHousehold } from '@/lib/utils/billing-cycle-server';
import { Prisma } from '@prisma/client';

/**
 * Transform a transaction from database format to API response format
 */
function transformTransaction(tx: {
  id: string;
  type: string;
  transactionDate: Date;
  paymentDate: Date | null;
  amountIls: Prisma.Decimal;
  currency: string;
  amountOriginal: Prisma.Decimal;
  categoryId: string | null;
  suggestedCategoryId: string | null;
  suggestionConfidence: number | null;
  payeeId: string | null;
  paymentMethod: string;
  paymentNumber: number | null;
  totalPayments: number | null;
  notes: string | null;
  source: string;
  isRecurring: boolean;
  isSplit: boolean;
  originalTransactionId: string | null;
  paymentIdentifier: string | null;
  excludedFromFlow: boolean;
  profileId: string | null;
  householdId: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: { tag: { id: string } }[];
  category?: { id: string; name: string } | null;
  suggestedCategory?: { id: string; name: string } | null;
  payee?: { id: string; name: string } | null;
  profile?: { id: string; name: string } | null;
}) {
  return {
    id: tx.id,
    type: tx.type,
    transactionDate: tx.transactionDate.toISOString().split('T')[0],
    paymentDate: tx.paymentDate?.toISOString().split('T')[0] ?? null,
    amountIls: Number(tx.amountIls),
    currency: tx.currency,
    amountOriginal: Number(tx.amountOriginal),
    categoryId: tx.categoryId,
    categoryName: tx.category?.name ?? null,
    suggestedCategoryId: tx.suggestedCategoryId,
    suggestedCategoryName: tx.suggestedCategory?.name ?? null,
    suggestionConfidence: tx.suggestionConfidence,
    payeeId: tx.payeeId,
    payeeName: tx.payee?.name ?? null,
    paymentMethod: tx.paymentMethod,
    paymentNumber: tx.paymentNumber,
    totalPayments: tx.totalPayments,
    notes: tx.notes,
    source: tx.source,
    isRecurring: tx.isRecurring,
    isSplit: tx.isSplit,
    originalTransactionId: tx.originalTransactionId,
    paymentIdentifier: tx.paymentIdentifier,
    excludedFromFlow: tx.excludedFromFlow,
    profileId: tx.profileId,
    profileName: tx.profile?.name ?? null,
    householdId: tx.householdId,
    tagIds: tx.tags?.map((t) => t.tag.id) ?? [],
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
  };
}

/**
 * GET /api/budget/transactions
 * Get transactions with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);

    // Parse query params
    const filterParams: Record<string, unknown> = {};
    if (searchParams.get('month')) filterParams.month = searchParams.get('month');
    if (searchParams.get('startDate')) filterParams.startDate = searchParams.get('startDate');
    if (searchParams.get('endDate')) filterParams.endDate = searchParams.get('endDate');
    if (searchParams.get('type')) filterParams.type = searchParams.get('type');
    if (searchParams.get('categoryId')) filterParams.categoryId = searchParams.get('categoryId');
    if (searchParams.get('payeeId')) filterParams.payeeId = searchParams.get('payeeId');
    if (searchParams.get('profileId')) filterParams.profileId = searchParams.get('profileId');
    if (searchParams.get('source')) filterParams.source = searchParams.get('source');
    if (searchParams.get('paymentMethod'))
      filterParams.paymentMethod = searchParams.get('paymentMethod');
    if (searchParams.get('limit')) filterParams.limit = parseInt(searchParams.get('limit')!, 10);
    if (searchParams.get('offset')) filterParams.offset = parseInt(searchParams.get('offset')!, 10);
    if (searchParams.get('tagIds')) {
      filterParams.tagIds = searchParams.get('tagIds')!.split(',');
    }
    if (searchParams.get('uncategorized') === 'true') filterParams.uncategorized = true;
    if (searchParams.get('accountNumber'))
      filterParams.accountNumber = searchParams.get('accountNumber');

    const validation = transactionFiltersSchema.safeParse(filterParams);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const filters = validation.data;

    // Build where clause. Transactions linked to a blacklisted payee are
    // hidden everywhere in the app — but transactions with no payee at all
    // (payeeId IS NULL) must still surface so they can be reviewed.
    const where: Prisma.BudgetTransactionWhereInput = {
      householdId,
      isDeleted: false,
      OR: [{ payeeId: null }, { payee: { isBlacklisted: false } }],
    };

    // Date filters
    if (filters.month) {
      // Credit cards use the billing cycle; bank/other use the calendar month.
      // Merged via AND so it composes with the payee-blacklist OR above (the
      // fragment carries its own OR).
      const monthWhere = await getMonthTransactionWhereForHousehold(householdId, filters.month);
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        monthWhere,
      ];
    } else {
      if (filters.startDate) {
        where.transactionDate = {
          ...(where.transactionDate as object),
          gte: new Date(filters.startDate),
        };
      }
      if (filters.endDate) {
        where.transactionDate = {
          ...(where.transactionDate as object),
          lte: new Date(filters.endDate),
        };
      }
    }

    // Other filters
    if (filters.type) where.type = filters.type;
    if (filters.payeeId) where.payeeId = filters.payeeId;
    if (filters.profileId) where.profileId = filters.profileId;
    if (filters.source) where.source = filters.source;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.accountNumber) where.paymentIdentifier = filters.accountNumber;

    // Uncategorized filter takes precedence over categoryId and tagIds
    // Income transactions are never considered uncategorized
    if (filters.uncategorized) {
      where.categoryId = null;
      where.tags = { none: {} };
      where.type = 'expense';
    } else {
      if (filters.categoryId) where.categoryId = filters.categoryId;
      if (filters.tagIds && filters.tagIds.length > 0) {
        where.tags = {
          some: {
            tagId: { in: filters.tagIds },
          },
        };
      }
    }

    // Get total count and transactions in parallel (same where clause, no dependency)
    const [total, transactions] = await Promise.all([
      prisma.budgetTransaction.count({ where }),
      prisma.budgetTransaction.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true },
          },
          suggestedCategory: {
            select: { id: true, name: true },
          },
          payee: {
            select: { id: true, name: true },
          },
          profile: {
            select: { id: true, name: true },
          },
          tags: {
            include: {
              tag: {
                select: { id: true },
              },
            },
          },
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        take: filters.limit,
        skip: filters.offset,
      }),
    ]);

    const transformedTransactions = transactions.map(transformTransaction);

    return NextResponse.json({
      success: true,
      data: {
        items: transformedTransactions,
        pagination: {
          total,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: filters.offset + transactions.length < total,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/transactions
 * Create a new transaction
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createTransactionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify category belongs to household if provided
    if (data.categoryId) {
      const category = await prisma.budgetCategory.findFirst({
        where: { id: data.categoryId, householdId },
      });
      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    // Verify payee belongs to household if provided
    if (data.payeeId) {
      const payee = await prisma.budgetPayee.findFirst({
        where: { id: data.payeeId, householdId },
      });
      if (!payee) {
        return NextResponse.json({ success: false, error: 'Payee not found' }, { status: 404 });
      }
    }

    // Verify profile belongs to household if provided
    if (data.profileId) {
      const profileInHousehold = await prisma.householdMember.findFirst({
        where: { householdId, profileId: data.profileId },
      });
      if (!profileInHousehold) {
        return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
      }
    }

    // Verify tags belong to household
    if (data.tagIds && data.tagIds.length > 0) {
      const tags = await prisma.budgetTag.findMany({
        where: {
          id: { in: data.tagIds },
          householdId,
        },
      });
      if (tags.length !== data.tagIds.length) {
        return NextResponse.json(
          { success: false, error: 'One or more tags not found' },
          { status: 404 }
        );
      }
    }

    // Create the transaction
    const transaction = await prisma.budgetTransaction.create({
      data: {
        type: data.type,
        transactionDate: new Date(data.transactionDate),
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
        amountIls: data.amountIls,
        currency: data.currency,
        amountOriginal: data.amountOriginal ?? data.amountIls,
        categoryId: data.categoryId ?? null,
        payeeId: data.payeeId ?? null,
        paymentMethod: data.paymentMethod,
        paymentNumber: data.paymentNumber ?? null,
        totalPayments: data.totalPayments ?? null,
        notes: data.notes ?? null,
        source: data.source,
        isRecurring: data.isRecurring,
        paymentIdentifier: data.paymentIdentifier ?? null,
        excludedFromFlow: data.excludedFromFlow,
        profileId: data.profileId ?? null,
        householdId,
      },
    });

    const transactionId = transaction.id;

    // Create tag links in parallel batches
    if (data.tagIds && data.tagIds.length > 0) {
      const BATCH_SIZE = 5;
      for (let i = 0; i < data.tagIds.length; i += BATCH_SIZE) {
        await Promise.all(
          data.tagIds.slice(i, i + BATCH_SIZE).map((tagId) =>
            prisma.budgetTransactionTag.create({
              data: {
                transactionId,
                tagId,
              },
            })
          )
        );
      }
    }

    // Fetch with tags for response
    const transactionWithTags = await prisma.budgetTransaction.findUnique({
      where: { id: transactionId },
      include: {
        category: {
          select: { id: true, name: true },
        },
        payee: {
          select: { id: true, name: true },
        },
        profile: {
          select: { id: true, name: true },
        },
        tags: {
          include: {
            tag: {
              select: { id: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: transformTransaction(transactionWithTags!),
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create transaction' },
      { status: 500 }
    );
  }
}
