import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * DELETE /api/moneytor/stocks/[productId]
 *
 * Removes the local mirror (holdings + snapshots) of a Moneytor stock account
 * for the active household. Note: a subsequent sync will re-create the rows if
 * the account is still configured in Moneytor itself.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { productId } = await params;
    const householdId = context.activeHousehold.id;

    const [holdings, snapshots] = await prisma.$transaction([
      prisma.moneytorStockHolding.deleteMany({ where: { householdId, productId } }),
      prisma.moneytorStockSnapshot.deleteMany({ where: { householdId, productId } }),
    ]);

    return NextResponse.json({
      ok: true,
      deletedHoldings: holdings.count,
      deletedSnapshots: snapshots.count,
    });
  } catch (err) {
    console.error('Moneytor account delete failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to delete Moneytor account. Check server logs.' },
      { status: 500 }
    );
  }
}
