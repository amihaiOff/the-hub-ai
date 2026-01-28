import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/debug/context
 * Debug endpoint to see current auth context
 */
export async function GET() {
  try {
    const context = await getCurrentContext();

    if (!context) {
      return NextResponse.json({
        success: false,
        error: 'No context - user not authenticated or no profile',
      });
    }

    // Also check what's in the database for this household
    const categoryGroupCount = await prisma.budgetCategoryGroup.count({
      where: { householdId: context.activeHousehold.id },
    });

    const allHouseholds = await prisma.household.findMany({
      select: { id: true, name: true },
    });

    const allCategoryGroups = await prisma.budgetCategoryGroup.findMany({
      select: { id: true, name: true, householdId: true },
    });

    return NextResponse.json({
      success: true,
      context: {
        user: context.user,
        profile: context.profile,
        activeHousehold: context.activeHousehold,
        householdsCount: context.households.length,
      },
      debug: {
        categoryGroupsForActiveHousehold: categoryGroupCount,
        allHouseholdsInDb: allHouseholds,
        allCategoryGroupsInDb: allCategoryGroups,
      },
    });
  } catch (error) {
    console.error('Debug context error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
