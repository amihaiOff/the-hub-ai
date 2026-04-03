import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateCartItemSchema } from '@/lib/validations/shopping';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/shopping/cart/[id]
 * Update a cart item (toggle checked, update quantity).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify cart item belongs to household
    const existingCartItem = await prisma.shoppingCartItem.findFirst({
      where: { id, householdId },
    });

    if (!existingCartItem) {
      return NextResponse.json({ success: false, error: 'Cart item not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateCartItemSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { checked, quantity } = validation.data;

    const cartItem = await prisma.shoppingCartItem.update({
      where: { id },
      data: {
        ...(checked !== undefined && { checked }),
        ...(quantity !== undefined && { quantity }),
      },
      include: {
        item: {
          include: {
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: cartItem.id,
        itemId: cartItem.itemId,
        itemName: cartItem.item.name,
        categoryId: cartItem.item.category.id,
        categoryName: cartItem.item.category.name,
        quantity: cartItem.quantity,
        checked: cartItem.checked,
      },
    });
  } catch (error) {
    console.error('Error updating cart item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update cart item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shopping/cart/[id]
 * Remove a single item from the cart.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify cart item belongs to household
    const existingCartItem = await prisma.shoppingCartItem.findFirst({
      where: { id, householdId },
    });

    if (!existingCartItem) {
      return NextResponse.json({ success: false, error: 'Cart item not found' }, { status: 404 });
    }

    await prisma.shoppingCartItem.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error removing cart item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove cart item' },
      { status: 500 }
    );
  }
}
