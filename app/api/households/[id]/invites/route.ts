import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext, isHouseholdAdmin } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { validateCuid } from '@/lib/api/validation';
import { inviteExpiryFromNow } from '@/lib/invites';

const createInviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['admin', 'member']).optional().default('member'),
  suggestedName: z.string().min(1).max(100).optional().nullable(),
  suggestedColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
});

/**
 * GET /api/households/[id]/invites
 * List pending (unaccepted, unexpired) invites for a household. Admin only.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const idValidation = validateCuid(rawId);
  if (!idValidation.valid) return idValidation.response;
  const householdId = idValidation.id;

  const context = await getCurrentContext(householdId);
  if (!context)
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (context.activeHousehold.id !== householdId || !isHouseholdAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const invites = await prisma.householdInvite.findMany({
    where: { householdId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    success: true,
    data: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      suggestedName: i.suggestedName,
      suggestedColor: i.suggestedColor,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
  });
}

/**
 * POST /api/households/[id]/invites
 * Create (or refresh) a pending invite. Admin only. If a pending invite for
 * this email already exists it's updated in place (new expiry, new role).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const idValidation = validateCuid(rawId);
    if (!idValidation.valid) return idValidation.response;
    const householdId = idValidation.id;

    const context = await getCurrentContext(householdId);
    if (!context)
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (context.activeHousehold.id !== householdId || !isHouseholdAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validation = createInviteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }
    const { role, suggestedName, suggestedColor } = validation.data;
    const email = validation.data.email.trim().toLowerCase();

    // Guard: if an existing household member already owns this email, no
    // point creating an invite — the person is already in.
    const existingMember = await prisma.profile.findFirst({
      where: {
        user: { email },
        householdMemberships: { some: { householdId } },
      },
    });
    if (existingMember) {
      return NextResponse.json(
        { success: false, error: 'That email is already a member of this household.' },
        { status: 400 }
      );
    }

    const invite = await prisma.householdInvite.upsert({
      where: { householdId_email: { householdId, email } },
      update: {
        role,
        suggestedName: suggestedName ?? null,
        suggestedColor: suggestedColor ?? null,
        expiresAt: inviteExpiryFromNow(),
        // Clear any prior acceptance so a re-invite is genuinely pending.
        acceptedAt: null,
        acceptedByUserId: null,
        invitedByProfileId: context.profile.id,
      },
      create: {
        householdId,
        email,
        role,
        suggestedName: suggestedName ?? null,
        suggestedColor: suggestedColor ?? null,
        expiresAt: inviteExpiryFromNow(),
        invitedByProfileId: context.profile.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        suggestedName: invite.suggestedName,
        suggestedColor: invite.suggestedColor,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json({ success: false, error: 'Failed to create invite' }, { status: 500 });
  }
}
