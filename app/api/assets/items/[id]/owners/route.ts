import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateCuid } from '@/lib/api/validation';

const updateOwnersSchema = z.object({
  profileIds: z.array(z.string().cuid()).min(1),
});

/**
 * GET /api/assets/items/[id]/owners
 * Get current owners of a misc asset
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const owners = await prisma.miscAssetOwner.findMany({
      where: { assetId: id },
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
 * PUT /api/assets/items/[id]/owners
 * Update owners of a misc asset (replace all owners)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const idValidation = validateCuid(rawId);
    if (!idValidation.valid) return idValidation.response;
    const id = idValidation.id;

    // Parse and validate body BEFORE any DB operations
    const body = await request.json();
    const validation = updateOwnersSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { profileIds } = validation.data;

    const context = await getCurrentContext();

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify all profiles are in the household (early validation)
    const validProfileIds = profileIds.filter((pid) =>
      context.householdProfiles.some((hp) => hp.id === pid)
    );

    if (validProfileIds.length !== profileIds.length) {
      return NextResponse.json(
        { success: false, error: 'Some profiles are not in your household' },
        { status: 400 }
      );
    }

    // Verify asset exists and user has access
    const asset = await prisma.miscAsset.findUnique({
      where: { id },
    });

    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    // Fetch current owners separately (for Neon serverless compatibility)
    const currentOwners = await prisma.miscAssetOwner.findMany({
      where: { assetId: id },
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

    // Replace owners with rollback on failure
    // Delete existing owners
    await prisma.miscAssetOwner.deleteMany({
      where: { assetId: id },
    });

    // Create new owners one by one (createMany has issues with Neon HTTP fetch mode)
    // Track created owners for potential rollback
    const createdOwnerIds: string[] = [];
    try {
      for (const profileId of validProfileIds) {
        await prisma.miscAssetOwner.create({
          data: {
            assetId: id,
            profileId,
          },
        });
        createdOwnerIds.push(profileId);
      }
    } catch (createError) {
      // Rollback: restore previous owners
      console.error('Error creating new owners, rolling back:', createError);
      try {
        // Delete any partially created owners
        if (createdOwnerIds.length > 0) {
          await prisma.miscAssetOwner.deleteMany({
            where: { assetId: id },
          });
        }
        // Restore original owners
        for (const profileId of currentOwnerIds) {
          await prisma.miscAssetOwner.create({
            data: {
              assetId: id,
              profileId,
            },
          });
        }
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      throw createError;
    }

    // Return profile details from context (avoids additional DB query with include)
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
    return NextResponse.json({ success: false, error: 'Failed to update owners' }, { status: 500 });
  }
}
