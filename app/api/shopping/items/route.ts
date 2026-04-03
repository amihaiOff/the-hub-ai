import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createShoppingItemSchema } from '@/lib/validations/shopping';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/shopping/items
 * List all shopping items with category info and cart status.
 * Supports ?search= query param for case-insensitive filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const search = request.nextUrl.searchParams.get('search');

    const items = await prisma.shoppingItem.findMany({
      where: {
        householdId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { nameHe: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
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
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });

    const data = items.map((item) => ({
      id: item.id,
      name: item.name,
      nameHe: item.nameHe,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      isDefault: item.isDefault,
      lastPurchasedAt: item.lastPurchasedAt?.toISOString() ?? null,
      warningDays: item.warningDays,
      inCart: item.cartItems.length > 0,
    }));

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching shopping items:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shopping items' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shopping/items
 * Create a new shopping item.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createShoppingItemSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, categoryId, nameHe, isDefault, warningDays } = validation.data;

    // Verify category belongs to household
    const category = await prisma.shoppingCategory.findFirst({
      where: { id: categoryId, householdId },
    });

    if (!category) {
      return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    const item = await prisma.shoppingItem.create({
      data: {
        name,
        categoryId,
        householdId,
        ...(nameHe !== undefined && { nameHe }),
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
        inCart: false,
      },
    });
  } catch (error) {
    console.error('Error creating shopping item:', error);

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
      { success: false, error: 'Failed to create shopping item' },
      { status: 500 }
    );
  }
}
