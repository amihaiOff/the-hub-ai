import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * PATCH /api/moneytor/accounts/[id]
 * Update editable per-account metadata. Today only `customSubtitle`, but
 * structured to make it easy to add more fields (custom group, sort order, …).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = (await req.json()) as { customSubtitle?: string | null };

    // Verify the account belongs to the active household before letting the
    // caller mutate it — guards against cross-household tampering.
    const existing = await prisma.moneytorAccount.findUnique({
      where: { id },
      select: { householdId: true },
    });
    if (!existing || existing.householdId !== context.activeHousehold.id) {
      return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 });
    }

    const data: { customSubtitle?: string | null } = {};
    if ('customSubtitle' in body) {
      const raw = body.customSubtitle;
      data.customSubtitle =
        raw == null ? null : typeof raw === 'string' ? raw.trim() || null : null;
    }

    const updated = await prisma.moneytorAccount.update({
      where: { id },
      data,
      select: { id: true, customSubtitle: true },
    });

    return NextResponse.json({ ok: true, account: updated });
  } catch (err) {
    console.error('Moneytor account PATCH failed:', err);
    return NextResponse.json({ ok: false, error: 'Failed to update account.' }, { status: 500 });
  }
}
