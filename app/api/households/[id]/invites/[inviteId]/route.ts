import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext, isHouseholdAdmin } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { validateCuid } from '@/lib/api/validation';

/**
 * DELETE /api/households/[id]/invites/[inviteId]
 * Revoke a pending invite. Admin only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const { id: rawId, inviteId: rawInviteId } = await params;
  const idValidation = validateCuid(rawId);
  if (!idValidation.valid) return idValidation.response;
  const inviteValidation = validateCuid(rawInviteId);
  if (!inviteValidation.valid) return inviteValidation.response;
  const householdId = idValidation.id;
  const inviteId = inviteValidation.id;

  const context = await getCurrentContext(householdId);
  if (!context)
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (context.activeHousehold.id !== householdId || !isHouseholdAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const invite = await prisma.householdInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.householdId !== householdId) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  await prisma.householdInvite.delete({ where: { id: inviteId } });
  return NextResponse.json({ success: true });
}
