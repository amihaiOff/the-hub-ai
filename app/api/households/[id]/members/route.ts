import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext, isHouseholdAdmin } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateCuid } from '@/lib/api/validation';

const addMemberSchema = z.object({
  profileId: z.string().cuid(),
  role: z.enum(['admin', 'member']).optional().default('member'),
});

/**
 * POST /api/households/[id]/members
 * Add a profile to household (admin/owner only)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const idValidation = validateCuid(rawId);
    if (!idValidation.valid) return idValidation.response;
    const householdId = idValidation.id;

    const context = await getCurrentContext(householdId);

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access and is admin/owner
    if (context.activeHousehold.id !== householdId || !isHouseholdAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validation = addMemberSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { profileId, role } = validation.data;

    // Verify profile exists
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    // Check if already a member
    const existingMembership = await prisma.householdMember.findUnique({
      where: {
        householdId_profileId: {
          householdId,
          profileId,
        },
      },
    });

    if (existingMembership) {
      return NextResponse.json(
        { success: false, error: 'Profile is already a member' },
        { status: 400 }
      );
    }

    // Can't add someone as owner (owner is only created on household creation)
    const member = await prisma.householdMember.create({
      data: {
        householdId,
        profileId,
        role,
      },
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
        id: member.profile.id,
        name: member.profile.name,
        image: member.profile.image,
        color: member.profile.color,
        role: member.role,
        hasUser: member.profile.userId !== null,
        joinedAt: member.joinedAt,
      },
    });
  } catch (error) {
    console.error('Error adding member:', error);
    return NextResponse.json({ success: false, error: 'Failed to add member' }, { status: 500 });
  }
}
