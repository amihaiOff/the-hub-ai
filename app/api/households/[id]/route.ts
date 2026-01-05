import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext, isHouseholdAdmin } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { validateCuid } from '@/lib/api/validation';

const updateHouseholdSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/households/[id]
 * Get household details with members
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const validation = validateCuid(rawId);
    if (!validation.valid) return validation.response;
    const id = validation.id;

    const context = await getCurrentContext(id);

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to this household
    const isMember = context.households.some((h) => h.id === id);
    if (!isMember) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Get household with members
    const household = await prisma.household.findUnique({
      where: { id },
      include: {
        members: {
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
        },
      },
    });

    if (!household) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: household.id,
        name: household.name,
        description: household.description,
        members: household.members.map((m) => ({
          id: m.profile.id,
          name: m.profile.name,
          image: m.profile.image,
          color: m.profile.color,
          role: m.role,
          hasUser: m.profile.userId !== null,
          joinedAt: m.joinedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching household:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch household' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/households/[id]
 * Update household (admin/owner only)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const idValidation = validateCuid(rawId);
    if (!idValidation.valid) return idValidation.response;
    const id = idValidation.id;

    const context = await getCurrentContext(id);

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access and is admin/owner
    if (context.activeHousehold.id !== id || !isHouseholdAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validation = updateHouseholdSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const household = await prisma.household.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: household.id,
        name: household.name,
        description: household.description,
      },
    });
  } catch (error) {
    console.error('Error updating household:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update household' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/households/[id]
 * Delete household (owner only)
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

    const context = await getCurrentContext(id);

    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is owner of this household
    const membership = context.households.find((h) => h.id === id);
    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'Only household owner can delete' },
        { status: 403 }
      );
    }

    // Prevent deleting last household
    if (context.households.length <= 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete your only household' },
        { status: 400 }
      );
    }

    await prisma.household.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting household:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete household' },
      { status: 500 }
    );
  }
}
