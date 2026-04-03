import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { deliverCartSchema } from '@/lib/validations/shopping';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/shopping/cart/deliver
 * Mark the cart as delivered. Checked items are "delivered" (removed from cart,
 * lastPurchasedAt updated), except for missingItemIds which stay in cart unchecked.
 * Default items are re-added to the cart if not already present.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = deliverCartSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { missingItemIds = [] } = validation.data;
    const missingSet = new Set(missingItemIds);

    // Get all cart items for this household
    const cartItems = await prisma.shoppingCartItem.findMany({
      where: { householdId },
      include: { item: true },
    });

    const checkedItems = cartItems.filter((ci) => ci.checked);
    const uncheckedItems = cartItems.filter((ci) => !ci.checked);

    // Split checked items into delivered vs missing
    const deliveredItems = checkedItems.filter((ci) => !missingSet.has(ci.itemId));
    const missingItems = checkedItems.filter((ci) => missingSet.has(ci.itemId));

    const now = new Date();

    // Use a transaction for atomicity
    const defaultsAdded = await prisma.$transaction(async (tx) => {
      // 1. Update lastPurchasedAt for delivered items and delete them from cart
      if (deliveredItems.length > 0) {
        await tx.shoppingItem.updateMany({
          where: { id: { in: deliveredItems.map((ci) => ci.itemId) } },
          data: { lastPurchasedAt: now },
        });

        await tx.shoppingCartItem.deleteMany({
          where: { id: { in: deliveredItems.map((ci) => ci.id) } },
        });
      }

      // 2. Uncheck missing items (keep them in cart for next delivery)
      if (missingItems.length > 0) {
        await tx.shoppingCartItem.updateMany({
          where: { id: { in: missingItems.map((ci) => ci.id) } },
          data: { checked: false },
        });
      }

      // 3. Unchecked items already have checked=false, no update needed

      // 4. Add default items to cart if not already present
      const remainingCartItemIds = new Set([
        ...missingItems.map((ci) => ci.itemId),
        ...uncheckedItems.map((ci) => ci.itemId),
      ]);

      const defaultItems = await tx.shoppingItem.findMany({
        where: {
          householdId,
          isDefault: true,
          id: { notIn: Array.from(remainingCartItemIds) },
        },
      });

      if (defaultItems.length > 0) {
        await tx.shoppingCartItem.createMany({
          data: defaultItems.map((item) => ({
            itemId: item.id,
            householdId,
            quantity: 1,
            checked: false,
          })),
        });
      }

      // 5. Create delivery record
      await tx.shoppingDelivery.create({
        data: {
          householdId,
          itemCount: deliveredItems.length,
        },
      });

      return defaultItems.length;
    });

    return NextResponse.json({
      success: true,
      data: {
        delivered: deliveredItems.length,
        keptForNext: missingItems.length + uncheckedItems.length,
        defaultsAdded,
      },
    });
  } catch (error) {
    console.error('Error delivering cart:', error);
    return NextResponse.json({ success: false, error: 'Failed to deliver cart' }, { status: 500 });
  }
}
