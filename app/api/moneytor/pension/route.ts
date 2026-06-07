import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/moneytor/pension
 * Returns all pension + hishtalmut funds (no aggregation — one row per
 * Moneytor route) with per-type totals.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const rows = await prisma.moneytorPensionFund.findMany({
      where: { householdId },
      orderBy: [{ productType: 'asc' }, { balanceInBase: 'desc' }],
    });

    const funds = rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      routeName: r.routeName,
      routeCode: r.routeCode,
      name: r.name,
      institution: r.institution,
      productType: r.productType,
      sugKupa: r.sugKupa,
      accountNumber: r.accountNumber,
      accountOwner: r.accountOwner,
      fundId: r.fundId,
      fundOpeningDate: r.fundOpeningDate ? r.fundOpeningDate.toISOString().split('T')[0] : null,
      amount: Number(r.amount),
      currency: r.currency,
      balanceInBase: Number(r.balanceInBase),
      profitsFromLastYear: r.profitsFromLastYear != null ? Number(r.profitsFromLastYear) : null,
      monthlyDepositEmployee:
        r.monthlyDepositEmployee != null ? Number(r.monthlyDepositEmployee) : null,
      monthlyDepositEmployer:
        r.monthlyDepositEmployer != null ? Number(r.monthlyDepositEmployer) : null,
      monthlyDepositSum: r.monthlyDepositSum != null ? Number(r.monthlyDepositSum) : null,
      depositFrequency: r.depositFrequency,
      employerProvisionPct: r.employerProvisionPct != null ? Number(r.employerProvisionPct) : null,
      compensationProvisionPct:
        r.compensationProvisionPct != null ? Number(r.compensationProvisionPct) : null,
      mgmtFeeFromSavings: r.mgmtFeeFromSavings != null ? Number(r.mgmtFeeFromSavings) : null,
      mgmtFeeFromDeposit: r.mgmtFeeFromDeposit != null ? Number(r.mgmtFeeFromDeposit) : null,
      projectedMonthlyPension:
        r.projectedMonthlyPension != null ? Number(r.projectedMonthlyPension) : null,
      projectedSavingsWithPremiums:
        r.projectedSavingsWithPremiums != null ? Number(r.projectedSavingsWithPremiums) : null,
      projectedSavingsWithoutPremiums:
        r.projectedSavingsWithoutPremiums != null
          ? Number(r.projectedSavingsWithoutPremiums)
          : null,
      yearsToRetirement: r.yearsToRetirement,
      gilPrisha: r.gilPrisha,
      sumHafkadotPitsuyim: r.sumHafkadotPitsuyim != null ? Number(r.sumHafkadotPitsuyim) : null,
      sumHafkadotLoPitsuyim:
        r.sumHafkadotLoPitsuyim != null ? Number(r.sumHafkadotLoPitsuyim) : null,
      syncedAt: r.syncedAt.toISOString(),
    }));

    // Type totals — Moneytor labels these in Hebrew, so collapse on a known
    // substring rather than full equality to be tolerant of stray whitespace.
    const isPension = (pt: string) => pt.includes('פנסיה');
    const isHishtalmut = (pt: string) => pt.includes('השתלמות');

    const pensionTotal = funds
      .filter((f) => isPension(f.productType))
      .reduce((s, f) => s + f.balanceInBase, 0);
    const hishtalmutTotal = funds
      .filter((f) => isHishtalmut(f.productType))
      .reduce((s, f) => s + f.balanceInBase, 0);

    const asOf =
      rows.length > 0
        ? rows.reduce((latest, r) => (r.syncedAt > latest ? r.syncedAt : latest), rows[0].syncedAt)
        : null;

    return NextResponse.json({
      ok: true,
      asOf: asOf ? asOf.toISOString() : null,
      funds,
      totals: {
        pension: pensionTotal,
        hishtalmut: hishtalmutTotal,
        total: pensionTotal + hishtalmutTotal,
      },
    });
  } catch (err) {
    console.error('Moneytor pension list failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load pension funds. Check server logs.' },
      { status: 500 }
    );
  }
}
