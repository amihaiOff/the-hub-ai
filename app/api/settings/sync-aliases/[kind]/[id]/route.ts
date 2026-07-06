import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  userCanonicalId: z.string().trim().max(200).nullable(),
});

/**
 * PATCH /api/settings/sync-aliases/[kind]/[id]
 * Updates the user-defined canonical ID for a synced Moneytor entity.
 * Empty string or null clears the alias. When set, the sync reconciler
 * matches this row to any incoming payload whose stableKey equals this
 * value — this lets the user manually collapse re-linked accounts (whose
 * openfinanceAssetId churns) into a single row.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ kind: string; id: string }> }
) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { kind, id } = await ctx.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 }
    );
  }

  const raw = parsed.data.userCanonicalId;
  const value = raw && raw.length > 0 ? raw : null;
  const householdId = context.activeHousehold.id;

  try {
    switch (kind) {
      case 'account': {
        const res = await prisma.moneytorAccount.updateMany({
          where: { id, householdId },
          data: { userCanonicalId: value },
        });
        if (res.count === 0) throw new Error('not-found');
        break;
      }
      case 'pension': {
        const res = await prisma.moneytorPensionFund.updateMany({
          where: { id, householdId },
          data: { userCanonicalId: value },
        });
        if (res.count === 0) throw new Error('not-found');
        break;
      }
      case 'realEstate': {
        const res = await prisma.moneytorRealEstate.updateMany({
          where: { id, householdId },
          data: { userCanonicalId: value },
        });
        if (res.count === 0) throw new Error('not-found');
        break;
      }
      default:
        return NextResponse.json({ success: false, error: 'Unknown kind' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error && err.message === 'not-found' ? 'Not found' : 'Update failed';
    const status = msg === 'Not found' ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }

  return NextResponse.json({ success: true, data: { userCanonicalId: value } });
}
