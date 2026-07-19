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

    const accounts = rows.map((r) => {
      // Pull a clean tracks[] off rawData when present (mortgages and other
      // multi-route loans expose routesData with remainder/interest/payment
      // per track). Best-effort — invalid shapes fall back to undefined.
      let tracks:
        | Array<{
            interestType: string | null;
            interest: number | null;
            remainder: number | null;
            monthlyRepayment: number | null;
          }>
        | undefined;
      const raw = r.rawData as {
        routesData?: Array<{
          trackInterestType?: { value?: string };
          interest?: number | string;
          remainder?: number | string;
          monthlyRepayment?: number | string;
        }>;
        startDate?: string;
      } | null;
      if (Array.isArray(raw?.routesData) && raw!.routesData.length > 0) {
        tracks = raw!.routesData.map((t) => ({
          interestType: t.trackInterestType?.value ?? null,
          interest: t.interest != null ? Number(t.interest) : null,
          remainder: t.remainder != null ? Number(t.remainder) : null,
          monthlyRepayment: t.monthlyRepayment != null ? Number(t.monthlyRepayment) : null,
        }));
      }
      const startDate = raw?.startDate ?? null;

      return {
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
        customSubtitle: r.customSubtitle,
        syncedAt: r.syncedAt.toISOString(),
        // Debt-only extras for the mortgage card
        tracks,
        startDate,
      };
    });

    // Accumulate in integer cents to keep totals bit-stable across many
    // Decimal balances. Mirrors app/api/budget/analysis/route.ts.
    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;
    let bankTotalCents = 0;
    let debtTotalCents = 0;
    for (const r of rows) {
      const cents = toCents(r.balanceInBase);
      if (r.form === 'bank') bankTotalCents += cents;
      else if (r.form === 'debt') debtTotalCents += cents;
    }
    const bankTotal = fromCents(bankTotalCents);
    const debtTotal = fromCents(debtTotalCents);

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
        netInScope: fromCents(bankTotalCents + debtTotalCents),
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
