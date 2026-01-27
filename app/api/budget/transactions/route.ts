import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createTransactionSchema, transactionFiltersSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
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
  payeeId: string | null;
  paymentMethod: string;
  paymentNumber: number | null;
  totalPayments: number | null;
  notes: string | null;
  source: string;
  isRecurring: boolean;
  isSplit: boolean;
  originalTransactionId: string | null;
  profileId: string | null;
  householdId: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: { tag: { id: string } }[];
  category?: { id: string; name: string } | null;
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

    const validation = transactionFiltersSchema.safeParse(filterParams);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const filters = validation.data;

    // Build where clause
    const where: Prisma.BudgetTransactionWhereInput = {
      householdId,
    };

    // Date filters
    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month
      where.transactionDate = {
        gte: startDate,
        lte: endDate,
      };
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
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.payeeId) where.payeeId = filters.payeeId;
    if (filters.profileId) where.profileId = filters.profileId;
    if (filters.source) where.source = filters.source;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    // Tag filter (matches ANY of the specified tags)
    if (filters.tagIds && filters.tagIds.length > 0) {
      where.tags = {
        some: {
          tagId: { in: filters.tagIds },
        },
      };
    }

    // Get total count for pagination
    const total = await prisma.budgetTransaction.count({ where });

    // Fetch transactions with relations
    const transactions = await prisma.budgetTransaction.findMany({
      where,
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
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: filters.limit,
      skip: filters.offset,
    });

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

    // Use transaction to ensure atomicity for transaction + tag links creation
    const transactionId = await prisma.$transaction(async (tx) => {
      // Create transaction
      const transaction = await tx.budgetTransaction.create({
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
          profileId: data.profileId ?? null,
          householdId,
        },
      });

      // Create tag links
      if (data.tagIds && data.tagIds.length > 0) {
        for (const tagId of data.tagIds) {
          await tx.budgetTransactionTag.create({
            data: {
              transactionId: transaction.id,
              tagId,
            },
          });
        }
      }

      return transaction.id;
    });

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
