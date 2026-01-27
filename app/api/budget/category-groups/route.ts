import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createCategoryGroupSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/budget/category-groups
 * Get all category groups with their categories for the current household
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const groups = await prisma.budgetCategoryGroup.findMany({
      where: { householdId },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Transform Decimal to number for JSON response
    const transformedGroups = groups.map((group) => ({
      ...group,
      categories: group.categories.map((cat) => ({
        ...cat,
        budget: cat.budget ? Number(cat.budget) : null,
      })),
    }));

    return NextResponse.json({
      success: true,
      data: transformedGroups,
    });
  } catch (error) {
    console.error('Error fetching category groups:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch category groups' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/category-groups
 * Create a new category group
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createCategoryGroupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, sortOrder } = validation.data;

    // Get max sort order if not provided
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined) {
      const maxSortOrder = await prisma.budgetCategoryGroup.aggregate({
        where: { householdId },
        _max: { sortOrder: true },
      });
      finalSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1;
    }

    const group = await prisma.budgetCategoryGroup.create({
      data: {
        name,
        sortOrder: finalSortOrder,
        householdId,
      },
      include: {
        categories: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...group,
        categories: group.categories.map((cat) => ({
          ...cat,
          budget: cat.budget ? Number(cat.budget) : null,
        })),
      },
    });
  } catch (error) {
    console.error('Error creating category group:', error);

    // Handle unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'A category group with this name already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create category group' },
      { status: 500 }
    );
  }
}
