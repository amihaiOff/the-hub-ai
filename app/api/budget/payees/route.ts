import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createPayeeSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/budget/payees
 * Get all payees for the current household with transaction counts
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const payees = await prisma.budgetPayee.findMany({
      where: { householdId },
      include: {
        category: {
          select: { id: true, name: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Transform to match frontend interface
    const transformedPayees = payees.map((payee) => ({
      id: payee.id,
      name: payee.name,
      categoryId: payee.categoryId,
      categoryName: payee.category?.name ?? null,
      transactionCount: payee._count.transactions,
      householdId: payee.householdId,
      createdAt: payee.createdAt,
      updatedAt: payee.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: transformedPayees,
    });
  } catch (error) {
    console.error('Error fetching payees:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch payees' }, { status: 500 });
  }
}

/**
 * POST /api/budget/payees
 * Create a new payee
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createPayeeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, categoryId } = validation.data;

    // If categoryId provided, verify it belongs to household
    if (categoryId) {
      const category = await prisma.budgetCategory.findFirst({
        where: { id: categoryId, householdId },
      });

      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    const payee = await prisma.budgetPayee.create({
      data: {
        name,
        categoryId: categoryId ?? null,
        householdId,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: payee.id,
        name: payee.name,
        categoryId: payee.categoryId,
        categoryName: payee.category?.name ?? null,
        transactionCount: 0,
        householdId: payee.householdId,
        createdAt: payee.createdAt,
        updatedAt: payee.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error creating payee:', error);

    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'A payee with this name already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: 'Failed to create payee' }, { status: 500 });
  }
}
