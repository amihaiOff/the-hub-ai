import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/moneytor/accounts
 * Returns the active household's Moneytor accounts (bank + debt for now), with
 * per-form totals so the dashboard widget doesn't need to recompute.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const rows = await prisma.moneytorAccount.findMany({
      where: { householdId },
      orderBy: [{ form: 'asc' }, { balanceInBase: 'desc' }],
    });

    const accounts = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      form: r.form,
      name: r.name,
      institution: r.institution,
      subtype: r.subtype,
      accountNumber: r.accountNumber,
      currency: r.currency,
      balanceInBase: Number(r.balanceInBase),
      interestRate: r.interestRate != null ? Number(r.interestRate) : null,
      maturityDate: r.maturityDate ? r.maturityDate.toISOString().split('T')[0] : null,
      monthlyPayment: r.monthlyPayment != null ? Number(r.monthlyPayment) : null,
      syncedAt: r.syncedAt.toISOString(),
    }));

    const bankTotal = accounts
      .filter((a) => a.form === 'bank')
      .reduce((s, a) => s + a.balanceInBase, 0);
    const debtTotal = accounts
      .filter((a) => a.form === 'debt')
      .reduce((s, a) => s + a.balanceInBase, 0);

    const asOf =
      rows.length > 0
        ? rows.reduce((latest, r) => (r.syncedAt > latest ? r.syncedAt : latest), rows[0].syncedAt)
        : null;

    return NextResponse.json({
      ok: true,
      asOf: asOf ? asOf.toISOString() : null,
      accounts,
      totals: {
        bank: bankTotal,
        debt: debtTotal,
        netInScope: bankTotal + debtTotal,
      },
    });
  } catch (err) {
    console.error('Moneytor accounts list failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load accounts. Check server logs.' },
      { status: 500 }
    );
  }
}
