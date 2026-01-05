import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/households
 * List all households the current user belongs to
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: context.households,
    });
  } catch (error) {
    console.error('Error fetching households:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch households' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/households
 * Create a new household and add current user's profile as owner
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createHouseholdSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { name, description } = validation.data;

    const household = await prisma.$transaction(async (tx) => {
      // Create household
      const newHousehold = await tx.household.create({
        data: {
          name,
          description,
        },
      });

      // Add current profile as owner
      await tx.householdMember.create({
        data: {
          householdId: newHousehold.id,
          profileId: context.profile.id,
          role: 'owner',
        },
      });

      return newHousehold;
    });

    return NextResponse.json({
      success: true,
      data: {
        id: household.id,
        name: household.name,
        description: household.description,
        role: 'owner',
      },
    });
  } catch (error) {
    console.error('Error creating household:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create household' },
      { status: 500 }
    );
  }
}
