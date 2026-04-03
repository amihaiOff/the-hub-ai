import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateShoppingItemSchema } from '@/lib/validations/shopping';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/shopping/items/[id]
 * Update a shopping item's properties.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = updateShoppingItemSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    // Verify item belongs to household
    const existingItem = await prisma.shoppingItem.findFirst({
      where: { id, householdId },
    });

    if (!existingItem) {
      return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
    }

    const { name, nameHe, categoryId, isDefault, warningDays } = validation.data;

    // If categoryId is provided, verify it belongs to household
    if (categoryId) {
      const category = await prisma.shoppingCategory.findFirst({
        where: { id: categoryId, householdId },
      });

      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    const item = await prisma.shoppingItem.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameHe !== undefined && { nameHe }),
        ...(categoryId !== undefined && { categoryId }),
        ...(isDefault !== undefined && { isDefault }),
        ...(warningDays !== undefined && { warningDays }),
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
        id: item.id,
        name: item.name,
        nameHe: item.nameHe,
        categoryId: item.categoryId,
        categoryName: item.category.name,
        isDefault: item.isDefault,
        lastPurchasedAt: item.lastPurchasedAt?.toISOString() ?? null,
        warningDays: item.warningDays,
      },
    });
  } catch (error) {
    console.error('Error updating shopping item:', error);

    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'An item with this name already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to update shopping item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shopping/items/[id]
 * Delete a shopping item from the master list.
 * Cascades to remove associated cart items.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify item belongs to household
    const existingItem = await prisma.shoppingItem.findFirst({
      where: { id, householdId },
    });

    if (!existingItem) {
      return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
    }

    // Delete (cascades to cart items via onDelete: Cascade)
    await prisma.shoppingItem.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting shopping item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete shopping item' },
      { status: 500 }
    );
  }
}
