import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { addToCartSchema } from '@/lib/validations/shopping';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/shopping/cart
 * Get all cart items with item name and category info.
 * Ordered by category sortOrder then item name.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const cartItems = await prisma.shoppingCartItem.findMany({
      where: { householdId },
      include: {
        item: {
          include: {
            category: {
              select: { id: true, name: true, sortOrder: true },
            },
          },
        },
      },
      orderBy: [{ item: { category: { sortOrder: 'asc' } } }, { item: { name: 'asc' } }],
    });

    const data = cartItems.map((ci) => ({
      id: ci.id,
      itemId: ci.itemId,
      itemName: ci.item.name,
      categoryId: ci.item.category.id,
      categoryName: ci.item.category.name,
      quantity: ci.quantity,
      checked: ci.checked,
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching shopping cart:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shopping cart' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shopping/cart
 * Add an item to the cart. If already in cart, increment quantity.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = addToCartSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { itemId, quantity } = validation.data;

    // Verify item belongs to household
    const item = await prisma.shoppingItem.findFirst({
      where: { id: itemId, householdId },
    });

    if (!item) {
      return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
    }

    // Upsert: if already in cart, increment quantity
    const cartItem = await prisma.shoppingCartItem.upsert({
      where: {
        householdId_itemId: {
          householdId,
          itemId,
        },
      },
      create: {
        itemId,
        quantity,
        householdId,
      },
      update: {
        quantity: {
          increment: quantity,
        },
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
    console.error('Error adding item to cart:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add item to cart' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shopping/cart
 * Clear all checked items from the cart.
 */
export async function DELETE() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const result = await prisma.shoppingCartItem.deleteMany({
      where: { householdId, checked: true },
    });

    return NextResponse.json({
      success: true,
      data: { deletedCount: result.count },
    });
  } catch (error) {
    console.error('Error clearing checked cart items:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear checked items' },
      { status: 500 }
    );
  }
}
