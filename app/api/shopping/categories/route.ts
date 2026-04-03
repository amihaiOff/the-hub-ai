import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createShoppingCategorySchema } from '@/lib/validations/shopping';
import { getFirstZodError } from '@/lib/validations/common';

const DEFAULT_CATEGORIES = [
  'Meat & Fish',
  'Dairy',
  'Fruits',
  'Vegetables',
  'Dry Goods',
  'Cleaning',
  'Beverages',
  'Snacks',
  'Frozen',
  'Other',
];

/**
 * GET /api/shopping/categories
 * Get all shopping categories for the household.
 * Auto-seeds default categories if none exist.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    let categories = await prisma.shoppingCategory.findMany({
      where: { householdId },
      orderBy: { sortOrder: 'asc' },
    });

    // Auto-seed defaults if household has no categories
    if (categories.length === 0) {
      await prisma.shoppingCategory.createMany({
        data: DEFAULT_CATEGORIES.map((name, index) => ({
          name,
          sortOrder: index,
          householdId,
        })),
        skipDuplicates: true,
      });

      categories = await prisma.shoppingCategory.findMany({
        where: { householdId },
        orderBy: { sortOrder: 'asc' },
      });
    }

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching shopping categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shopping categories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shopping/categories
 * Create a new shopping category.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createShoppingCategorySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name } = validation.data;

    // Get next sort order
    const maxSort = await prisma.shoppingCategory.findFirst({
      where: { householdId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const category = await prisma.shoppingCategory.create({
      data: {
        name,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
        householdId,
      },
    });

    return NextResponse.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error('Error creating shopping category:', error);

    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'A category with this name already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create shopping category' },
      { status: 500 }
    );
  }
}
