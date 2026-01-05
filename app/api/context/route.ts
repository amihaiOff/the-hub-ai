import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';

/**
 * GET /api/context
 * Get the current user's context including profile, households, and household profiles
 */
export async function GET(request: NextRequest) {
  try {
    // Get optional householdId from query params
    const { searchParams } = new URL(request.url);
    const householdId = searchParams.get('householdId') || undefined;

    const context = await getCurrentContext(householdId);

    if (!context) {
      // User is not authenticated or needs onboarding
      return NextResponse.json(
        { success: false, error: 'Not found', needsOnboarding: true },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        profile: context.profile,
        households: context.households,
        activeHousehold: context.activeHousehold,
        householdProfiles: context.householdProfiles,
      },
    });
  } catch (error) {
    console.error('Error fetching context:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch context' }, { status: 500 });
  }
}
