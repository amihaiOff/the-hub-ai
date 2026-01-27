import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createCategorySchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/budget/categories
 * Get all categories for the current household (optionally filtered by group)
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    const categories = await prisma.budgetCategory.findMany({
      where: {
        householdId,
        ...(groupId && { groupId }),
      },
      include: {
        group: {
          select: { id: true, name: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
      orderBy: [{ group: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    // Transform Decimal to number for JSON response
    const transformedCategories = categories.map((cat) => ({
      ...cat,
      budget: cat.budget ? Number(cat.budget) : null,
    }));

    return NextResponse.json({
      success: true,
      data: transformedCategories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/categories
 * Create a new category
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createCategorySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, groupId, budget, isMust, sortOrder } = validation.data;

    // Verify group belongs to household
    const group = await prisma.budgetCategoryGroup.findFirst({
      where: { id: groupId, householdId },
    });

    if (!group) {
      return NextResponse.json(
        { success: false, error: 'Category group not found' },
        { status: 404 }
      );
    }

    // Get max sort order if not provided
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined) {
      const maxSortOrder = await prisma.budgetCategory.aggregate({
        where: { groupId },
        _max: { sortOrder: true },
      });
      finalSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1;
    }

    const category = await prisma.budgetCategory.create({
      data: {
        name,
        groupId,
        budget: budget ?? null,
        isMust: isMust ?? false,
        sortOrder: finalSortOrder,
        householdId,
      },
      include: {
        group: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...category,
        budget: category.budget ? Number(category.budget) : null,
      },
    });
  } catch (error) {
    console.error('Error creating category:', error);

    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'A category with this name already exists in the group' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create category' },
      { status: 500 }
    );
  }
}
