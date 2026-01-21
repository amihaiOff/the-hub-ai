import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateCuid } from '@/lib/api/validation';

const updateOwnersSchema = z.object({
  profileIds: z.array(z.string().cuid()).min(1),
});

/**
 * GET /api/portfolio/accounts/[id]/owners
 * Get current owners of a stock account
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const idValidation = validateCuid(rawId);
    if (!idValidation.valid) return idValidation.response;
    const id = idValidation.id;

    const context = await getCurrentContext();

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch owner IDs only (for Neon serverless compatibility)
    const owners = await prisma.stockAccountOwner.findMany({
      where: { accountId: id },
      select: { profileId: true },
    });

    // Verify user has access (at least one owner must be in user's household)
    const profileIds = owners.map((o) => o.profileId);
    const hasAccess = profileIds.some((pid) =>
      context.householdProfiles.some((hp) => hp.id === pid)
    );

    if (!hasAccess && owners.length > 0) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Get profile details from context (avoids additional DB query with include)
    const profileData = profileIds
      .map((pid) => context.householdProfiles.find((hp) => hp.id === pid))
      .filter((p) => p !== undefined)
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image,
        color: p.color,
      }));

    return NextResponse.json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    console.error('Error fetching owners:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch owners' }, { status: 500 });
  }
}

/**
 * PUT /api/portfolio/accounts/[id]/owners
 * Update owners of a stock account (replace all owners)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const idValidation = validateCuid(rawId);
    if (!idValidation.valid) return idValidation.response;
    const id = idValidation.id;

    const context = await getCurrentContext();

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify account exists and user has access
    const account = await prisma.stockAccount.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    // Fetch current owners separately (for Neon serverless compatibility)
    const currentOwners = await prisma.stockAccountOwner.findMany({
      where: { accountId: id },
      select: { profileId: true },
    });

    // Check current ownership
    const currentOwnerIds = currentOwners.map((o) => o.profileId);
    const hasAccess =
      currentOwnerIds.length === 0 ||
      currentOwnerIds.some((pid) => context.householdProfiles.some((hp) => hp.id === pid));

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validation = updateOwnersSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { profileIds } = validation.data;

    // Verify all profiles are in the household
    const validProfileIds = profileIds.filter((pid) =>
      context.householdProfiles.some((hp) => hp.id === pid)
    );

    if (validProfileIds.length !== profileIds.length) {
      return NextResponse.json(
        { success: false, error: 'Some profiles are not in your household' },
        { status: 400 }
      );
    }

    // Replace owners (sequential operations for Neon serverless compatibility)
    // Delete existing owners
    await prisma.stockAccountOwner.deleteMany({
      where: { accountId: id },
    });

    // Create new owners
    await prisma.stockAccountOwner.createMany({
      data: validProfileIds.map((profileId) => ({
        accountId: id,
        profileId,
      })),
    });

    // Return profile details from context (avoids additional DB query with include)
    // Since we just created owners from validProfileIds, use those directly
    const profileData = validProfileIds
      .map((pid) => context.householdProfiles.find((hp) => hp.id === pid))
      .filter((p) => p !== undefined)
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image,
        color: p.color,
      }));

    return NextResponse.json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    console.error('Error updating owners:', error);
    const errorDetails = {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
    };
    return NextResponse.json(
      { success: false, error: 'Failed to update owners', debug: errorDetails },
      { status: 500 }
    );
  }
}
