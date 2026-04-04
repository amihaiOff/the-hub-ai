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

    // Sequential individual operations for Neon serverless compatibility
    // (createMany/updateMany/deleteMany/$transaction silently fail on Neon HTTP adapter)

    // 1. Update lastPurchasedAt for delivered items and delete them from cart
    const BATCH_SIZE = 5;
    for (let i = 0; i < deliveredItems.length; i += BATCH_SIZE) {
      await Promise.all(
        deliveredItems.slice(i, i + BATCH_SIZE).map(async (ci) => {
          await prisma.shoppingItem.update({
            where: { id: ci.itemId },
            data: { lastPurchasedAt: now },
          });
          await prisma.shoppingCartItem.delete({ where: { id: ci.id } });
        })
      );
    }

    // 2. Uncheck missing items (keep them in cart for next delivery)
    for (let i = 0; i < missingItems.length; i += BATCH_SIZE) {
      await Promise.all(
        missingItems.slice(i, i + BATCH_SIZE).map((ci) =>
          prisma.shoppingCartItem.update({
            where: { id: ci.id },
            data: { checked: false },
          })
        )
      );
    }

    // 3. Unchecked items already have checked=false, no update needed

    // 4. Add default items to cart if not already present
    const remainingCartItemIds = new Set([
      ...missingItems.map((ci) => ci.itemId),
      ...uncheckedItems.map((ci) => ci.itemId),
    ]);

    const defaultItems = await prisma.shoppingItem.findMany({
      where: {
        householdId,
        isDefault: true,
        id: { notIn: Array.from(remainingCartItemIds) },
      },
    });

    for (let i = 0; i < defaultItems.length; i += BATCH_SIZE) {
      await Promise.all(
        defaultItems.slice(i, i + BATCH_SIZE).map(async (item) => {
          try {
            await prisma.shoppingCartItem.create({
              data: { itemId: item.id, householdId, quantity: 1, checked: false },
            });
          } catch {
            // Ignore if already in cart (unique constraint)
          }
        })
      );
    }

    // 5. Create delivery record
    await prisma.shoppingDelivery.create({
      data: { householdId, itemCount: deliveredItems.length },
    });

    const defaultsAdded = defaultItems.length;

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
