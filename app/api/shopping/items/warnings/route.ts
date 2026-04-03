import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/shopping/warnings
 * Get items where warningDays is set and the item hasn't been purchased
 * within that threshold. Returns items that should be suggested for purchase.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    // Get all items with warningDays set and lastPurchasedAt set
    const items = await prisma.shoppingItem.findMany({
      where: {
        householdId,
        warningDays: { not: null },
        lastPurchasedAt: { not: null },
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
        cartItems: {
          where: { householdId },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const now = new Date();

    const warnings = items
      .filter((item) => {
        if (!item.warningDays || !item.lastPurchasedAt) return false;
        const daysSince = Math.floor(
          (now.getTime() - item.lastPurchasedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSince >= item.warningDays;
      })
      .map((item) => {
        const daysSince = Math.floor(
          (now.getTime() - item.lastPurchasedAt!.getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          id: item.id,
          name: item.name,
          nameHe: item.nameHe,
          categoryId: item.categoryId,
          categoryName: item.category.name,
          warningDays: item.warningDays!,
          daysSinceLastPurchase: daysSince,
          lastPurchasedAt: item.lastPurchasedAt!.toISOString(),
          inCart: item.cartItems.length > 0,
        };
      });

    return NextResponse.json({
      success: true,
      data: warnings,
    });
  } catch (error) {
    console.error('Error fetching shopping warnings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shopping warnings' },
      { status: 500 }
    );
  }
}
