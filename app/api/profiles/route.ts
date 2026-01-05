import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext, isHouseholdAdmin } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createProfileSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#3b82f6'),
});

/**
 * GET /api/profiles
 * List all profiles in the active household
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const householdId = searchParams.get('householdId') || undefined;

    const context = await getCurrentContext(householdId);
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: context.householdProfiles,
    });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/profiles
 * Create a non-user profile in the active household (admin/owner only)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const householdId = searchParams.get('householdId') || undefined;

    const context = await getCurrentContext(householdId);
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin/owner can create profiles
    if (!isHouseholdAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validation = createProfileSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { name, color } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      // Create non-user profile (no userId)
      const profile = await tx.profile.create({
        data: {
          name,
          color,
          // No userId - this is a non-login profile
        },
      });

      // Add to current household as member
      await tx.householdMember.create({
        data: {
          householdId: context.activeHousehold.id,
          profileId: profile.id,
          role: 'member',
        },
      });

      return profile;
    });

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        name: result.name,
        image: result.image,
        color: result.color,
        role: 'member',
        hasUser: false,
      },
    });
  } catch (error) {
    console.error('Error creating profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create profile' },
      { status: 500 }
    );
  }
}
