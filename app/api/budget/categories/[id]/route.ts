import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateCategorySchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/budget/categories/[id]
 * Get a specific category with transaction count
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const category = await prisma.budgetCategory.findFirst({
      where: { id, householdId },
      include: {
        group: {
          select: { id: true, name: true },
        },
        _count: {
          select: { transactions: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...category,
        budget: category.budget ? Number(category.budget) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch category' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budget/categories/[id]
 * Update a category
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify category belongs to household
    const existingCategory = await prisma.budgetCategory.findFirst({
      where: { id, householdId },
    });

    if (!existingCategory) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateCategorySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, groupId, budget, isMust, sortOrder } = validation.data;

    // If changing group, verify new group belongs to household
    if (groupId && groupId !== existingCategory.groupId) {
      const newGroup = await prisma.budgetCategoryGroup.findFirst({
        where: { id: groupId, householdId },
      });

      if (!newGroup) {
        return NextResponse.json(
          { success: false, error: 'Target category group not found' },
          { status: 404 }
        );
      }
    }

    const category = await prisma.budgetCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(groupId !== undefined && { groupId }),
        ...(budget !== undefined && { budget }),
        ...(isMust !== undefined && { isMust }),
        ...(sortOrder !== undefined && { sortOrder }),
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
    console.error('Error updating category:', error);

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
      { success: false, error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/categories/[id]
 * Delete a category (transactions become uncategorized)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify category belongs to household
    const existingCategory = await prisma.budgetCategory.findFirst({
      where: { id, householdId },
    });

    if (!existingCategory) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    // Delete (transactions become uncategorized via SetNull)
    await prisma.budgetCategory.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
