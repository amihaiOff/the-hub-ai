import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext, isHouseholdAdmin } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateCuid } from '@/lib/api/validation';

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  image: z
    .string()
    .url()
    .max(500)
    .refine((url) => url.startsWith('https://'), { message: 'Image URL must use HTTPS' })
    .optional()
    .nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

/**
 * GET /api/profiles/[id]
 * Get profile details
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

    // Verify profile is in current household
    const householdProfile = context.householdProfiles.find((p) => p.id === id);
    if (!householdProfile) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const profile = await prisma.profile.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        image: true,
        color: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: profile.id,
        name: profile.name,
        image: profile.image,
        color: profile.color,
        role: householdProfile.role,
        hasUser: profile.userId !== null,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch profile' }, { status: 500 });
  }
}

/**
 * PUT /api/profiles/[id]
 * Update profile (own profile or admin/owner can update non-user profiles)
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

    // Check authorization
    const isOwnProfile = context.profile.id === id;
    const householdProfile = context.householdProfiles.find((p) => p.id === id);

    if (!householdProfile) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    // Can edit own profile, or admin/owner can edit non-user profiles
    const canEdit = isOwnProfile || (isHouseholdAdmin(context) && !householdProfile.hasUser);

    if (!canEdit) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validation = updateProfileSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const profile = await prisma.profile.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: profile.id,
        name: profile.name,
        image: profile.image,
        color: profile.color,
      },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/profiles/[id]
 * Delete non-user profile (admin/owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const idValidation = validateCuid(rawId);
    if (!idValidation.valid) return idValidation.response;
    const id = idValidation.id;

    const context = await getCurrentContext();

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Can't delete own profile
    if (context.profile.id === id) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete your own profile' },
        { status: 400 }
      );
    }

    // Must be admin/owner
    if (!isHouseholdAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Verify profile is in household and is not a user profile
    const householdProfile = context.householdProfiles.find((p) => p.id === id);
    if (!householdProfile) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    if (householdProfile.hasUser) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a profile linked to a user' },
        { status: 400 }
      );
    }

    await prisma.profile.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete profile' },
      { status: 500 }
    );
  }
}
