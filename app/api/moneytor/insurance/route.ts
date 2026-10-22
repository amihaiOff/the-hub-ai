import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const sum = (values: Prisma.Decimal[]) =>
  values.reduce((s, v) => s.plus(v), new Prisma.Decimal(0)).toNumber();

/**
 * GET /api/moneytor/insurance
 * Returns the active household's Moneytor insurance policies plus premium totals.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await prisma.moneytorInsurancePolicy.findMany({
      where: { householdId: context.activeHousehold.id },
      orderBy: [{ insuredName: 'asc' }, { monthlyPremium: 'desc' }],
    });

    const policies = rows.map((r) => ({
      id: r.id,
      policyNumber: r.policyNumber,
      title: r.title,
      company: r.company,
      companyShort: r.companyShort,
      categoryLabelHeb: r.categoryLabelHeb,
      categoryLabelEng: r.categoryLabelEng,
      status: r.status,
      monthlyPremium: Number(r.monthlyPremium),
      annualPremium: Number(r.annualPremium),
      renewalPeriod: r.renewalPeriod,
      insuredName: r.insuredName,
      coverages: Array.isArray(r.coverages) ? r.coverages : [],
    }));

    const asOf = rows.length > 0 ? rows[0].syncedAt.toISOString() : null;

    return NextResponse.json({
      ok: true,
      asOf,
      policies,
      totals: {
        monthly: sum(rows.map((r) => r.monthlyPremium)),
        annual: sum(rows.map((r) => r.annualPremium)),
        policies: policies.length,
        companies: new Set(policies.map((p) => p.company ?? p.companyShort).filter(Boolean)).size,
      },
    });
  } catch (err) {
    console.error('Moneytor insurance list failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load insurance. Check server logs.' },
      { status: 500 }
    );
  }
}
