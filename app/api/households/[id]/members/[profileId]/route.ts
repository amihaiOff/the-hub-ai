import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext, isHouseholdAdmin } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateCuids } from '@/lib/api/validation';

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

/**
 * PUT /api/households/[id]/members/[profileId]
 * Update member role (admin/owner only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  try {
    const { id: rawHouseholdId, profileId: rawProfileId } = await params;
    const idsValidation = validateCuids({ householdId: rawHouseholdId, profileId: rawProfileId });
    if (!idsValidation.valid) return idsValidation.response;
    const { householdId, profileId } = idsValidation.ids;

    const context = await getCurrentContext(householdId);

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access and is admin/owner
    if (context.activeHousehold.id !== householdId || !isHouseholdAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Find membership
    const membership = await prisma.householdMember.findUnique({
      where: {
        householdId_profileId: {
          householdId,
          profileId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    // Can't change owner role
    if (membership.role === 'owner') {
      return NextResponse.json(
        { success: false, error: 'Cannot change owner role' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = updateRoleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { role } = validation.data;

    const updatedMembership = await prisma.householdMember.update({
      where: {
        householdId_profileId: {
          householdId,
          profileId,
        },
      },
      data: { role },
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            image: true,
            color: true,
            userId: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedMembership.profile.id,
        name: updatedMembership.profile.name,
        role: updatedMembership.role,
      },
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update member role' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/households/[id]/members/[profileId]
 * Remove member from household (admin/owner only, can't remove owner)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  try {
    const { id: rawHouseholdId, profileId: rawProfileId } = await params;
    const idsValidation = validateCuids({ householdId: rawHouseholdId, profileId: rawProfileId });
    if (!idsValidation.valid) return idsValidation.response;
    const { householdId, profileId } = idsValidation.ids;

    const context = await getCurrentContext(householdId);

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access and is admin/owner
    if (context.activeHousehold.id !== householdId || !isHouseholdAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Find membership
    const membership = await prisma.householdMember.findUnique({
      where: {
        householdId_profileId: {
          householdId,
          profileId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    // Can't remove owner
    if (membership.role === 'owner') {
      return NextResponse.json(
        { success: false, error: 'Cannot remove household owner' },
        { status: 400 }
      );
    }

    await prisma.householdMember.delete({
      where: {
        householdId_profileId: {
          householdId,
          profileId,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove member' }, { status: 500 });
  }
}
