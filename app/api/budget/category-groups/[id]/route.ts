import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateCategoryGroupSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/budget/category-groups/[id]
 * Get a specific category group with its categories
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const group = await prisma.budgetCategoryGroup.findFirst({
      where: { id, householdId },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!group) {
      return NextResponse.json(
        { success: false, error: 'Category group not found' },
        { status: 404 }
      );
    }

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
    console.error('Error fetching category group:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch category group' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budget/category-groups/[id]
 * Update a category group
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify group belongs to household
    const existingGroup = await prisma.budgetCategoryGroup.findFirst({
      where: { id, householdId },
    });

    if (!existingGroup) {
      return NextResponse.json(
        { success: false, error: 'Category group not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validation = updateCategoryGroupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, sortOrder } = validation.data;

    const group = await prisma.budgetCategoryGroup.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
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
    console.error('Error updating category group:', error);

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
      { success: false, error: 'Failed to update category group' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/category-groups/[id]
 * Delete a category group (cascades to categories and their transactions become uncategorized)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify group belongs to household
    const existingGroup = await prisma.budgetCategoryGroup.findFirst({
      where: { id, householdId },
    });

    if (!existingGroup) {
      return NextResponse.json(
        { success: false, error: 'Category group not found' },
        { status: 404 }
      );
    }

    // Delete (cascades to categories, transactions become uncategorized via SetNull)
    await prisma.budgetCategoryGroup.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting category group:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete category group' },
      { status: 500 }
    );
  }
}
