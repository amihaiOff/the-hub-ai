import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/settings/sync-aliases
 * Lists every Moneytor-synced entity (bank/debt account, pension fund,
 * real estate property) for the active household along with its current
 * user-defined canonical ID + the auto-computed stableKey. The Settings UI
 * uses this to let the user pin an alias so re-linked entries collapse into
 * the same row.
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const householdId = context.activeHousehold.id;

  const [accounts, pensions, realEstate] = await Promise.all([
    prisma.moneytorAccount.findMany({
      where: { householdId },
      orderBy: [{ form: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        productId: true,
        name: true,
        form: true,
        institution: true,
        stableKey: true,
        userCanonicalId: true,
      },
    }),
    prisma.moneytorPensionFund.findMany({
      where: { householdId },
      orderBy: [{ institution: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        productId: true,
        name: true,
        institution: true,
        routeName: true,
        stableKey: true,
        userCanonicalId: true,
      },
    }),
    prisma.moneytorRealEstate.findMany({
      where: { householdId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        productId: true,
        name: true,
        address: true,
        stableKey: true,
        userCanonicalId: true,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      accounts: accounts.map((a) => ({
        kind: 'account' as const,
        id: a.id,
        productId: a.productId,
        name: a.name,
        form: a.form,
        subtitle: a.institution ?? null,
        stableKey: a.stableKey,
        userCanonicalId: a.userCanonicalId,
      })),
      pensions: pensions.map((p) => ({
        kind: 'pension' as const,
        id: p.id,
        productId: p.productId,
        name: p.name,
        subtitle: [p.institution, p.routeName].filter(Boolean).join(' · ') || null,
        stableKey: p.stableKey,
        userCanonicalId: p.userCanonicalId,
      })),
      realEstate: realEstate.map((r) => ({
        kind: 'realEstate' as const,
        id: r.id,
        productId: r.productId,
        name: r.name,
        subtitle: r.address ?? null,
        stableKey: r.stableKey,
        userCanonicalId: r.userCanonicalId,
      })),
    },
  });
}
