import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { reorderGroupsSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/budget/category-groups/reorder
 * Bulk update sort orders for category groups
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = reorderGroupsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { groups } = validation.data;

    // Verify all groups belong to household
    const groupIds = groups.map((g) => g.id);
    const existingGroups = await prisma.budgetCategoryGroup.findMany({
      where: {
        id: { in: groupIds },
        householdId,
      },
      select: { id: true },
    });

    if (existingGroups.length !== groupIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more category groups not found' },
        { status: 404 }
      );
    }

    // Update sort orders one by one (Neon compatibility)
    for (const group of groups) {
      await prisma.budgetCategoryGroup.update({
        where: { id: group.id },
        data: { sortOrder: group.sortOrder },
      });
    }

    // Fetch updated groups
    const updatedGroups = await prisma.budgetCategoryGroup.findMany({
      where: { householdId },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const transformedGroups = updatedGroups.map((group) => ({
      ...group,
      categories: group.categories.map((cat) => ({
        ...cat,
        budget: cat.budget ? Number(cat.budget) : null,
      })),
    }));

    return NextResponse.json({
      success: true,
      data: transformedGroups,
    });
  } catch (error) {
    console.error('Error reordering category groups:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reorder category groups' },
      { status: 500 }
    );
  }
}
