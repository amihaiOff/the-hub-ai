import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/budget/riseup-categories
 * Get all Riseup categories for the household (excluding deleted ones by default)
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    const categories = await prisma.riseupCategory.findMany({
      where: {
        householdId,
        ...(!includeDeleted && { isDeleted: false }),
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching riseup categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch riseup categories' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/budget/riseup-categories
 * Update mapping: assign a Riseup category to a budget category
 * Body: { id: string, budgetCategoryId: string | null }
 */
export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();
    const { id, budgetCategoryId } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Riseup category ID is required' },
        { status: 400 }
      );
    }

    // Verify the riseup category belongs to this household
    const existing = await prisma.riseupCategory.findFirst({
      where: { id, householdId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Riseup category not found' },
        { status: 404 }
      );
    }

    // If assigning to a budget category, verify it belongs to the household
    if (budgetCategoryId) {
      const budgetCategory = await prisma.budgetCategory.findFirst({
        where: { id: budgetCategoryId, householdId },
      });
      if (!budgetCategory) {
        return NextResponse.json(
          { success: false, error: 'Budget category not found' },
          { status: 404 }
        );
      }
    }

    const updated = await prisma.riseupCategory.update({
      where: { id },
      data: { budgetCategoryId: budgetCategoryId ?? null },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating riseup category:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update riseup category' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/riseup-categories
 * Soft-delete a Riseup category (won't be re-added on future imports)
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Riseup category ID is required' },
        { status: 400 }
      );
    }

    const existing = await prisma.riseupCategory.findFirst({
      where: { id, householdId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Riseup category not found' },
        { status: 404 }
      );
    }

    // Soft delete - mark as deleted and remove mapping
    const updated = await prisma.riseupCategory.update({
      where: { id },
      data: { isDeleted: true, budgetCategoryId: null },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error deleting riseup category:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete riseup category' },
      { status: 500 }
    );
  }
}
