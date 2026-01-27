import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { reorderCategoriesSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/budget/categories/reorder
 * Bulk update sort orders for categories
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = reorderCategoriesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { categories } = validation.data;

    // Verify all categories belong to household
    const categoryIds = categories.map((c) => c.id);
    const existingCategories = await prisma.budgetCategory.findMany({
      where: {
        id: { in: categoryIds },
        householdId,
      },
      select: { id: true },
    });

    if (existingCategories.length !== categoryIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more categories not found' },
        { status: 404 }
      );
    }

    // Update sort orders one by one (Neon compatibility)
    for (const category of categories) {
      await prisma.budgetCategory.update({
        where: { id: category.id },
        data: { sortOrder: category.sortOrder },
      });
    }

    return NextResponse.json({
      success: true,
      data: { updated: categories.length },
    });
  } catch (error) {
    console.error('Error reordering categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reorder categories' },
      { status: 500 }
    );
  }
}
