import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';

/**
 * GET /api/pension
 * Get the active household's pension summary — every account visible to
 * any member, per H1 of the codebase review (pension is a household asset).
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    // Fetch all pension accounts visible to this household.
    const accounts = await prisma.pensionAccount.findMany({
      where: householdVisibleWhere(householdId),
      include: {
        deposits: {
          orderBy: { salaryMonth: 'desc' },
        },
        owners: {
          include: {
            profile: {
              select: {
                id: true,
                name: true,
                image: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Accumulate in integer cents to avoid floating-point drift when
    // summing many Decimal values. Mirrors app/api/budget/analysis/route.ts.
    // Prisma Decimal → number happens once via `toCents`; sums stay integer
    // until output.
    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;

    let totalValueCents = 0;
    let totalDepositsCents = 0;
    let thisMonthDepositsCents = 0;

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const accountSummaries = accounts.map((account) => {
      const accountTotalDepositsCents = account.deposits.reduce(
        (sum, d) => sum + toCents(d.amount),
        0
      );

      const accountThisMonthCents = account.deposits
        .filter((d) => {
          const depositMonth = new Date(d.salaryMonth);
          return (
            depositMonth.getFullYear() === currentMonth.getFullYear() &&
            depositMonth.getMonth() === currentMonth.getMonth()
          );
        })
        .reduce((sum, d) => sum + toCents(d.amount), 0);

      totalValueCents += toCents(account.currentValue);
      totalDepositsCents += accountTotalDepositsCents;
      thisMonthDepositsCents += accountThisMonthCents;

      return {
        id: account.id,
        type: account.type,
        providerName: account.providerName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        currentValue: Number(account.currentValue),
        feeFromDeposit: Number(account.feeFromDeposit),
        feeFromTotal: Number(account.feeFromTotal),
        totalDeposits: fromCents(accountTotalDepositsCents),
        depositsCount: account.deposits.length,
        deposits: account.deposits.map((d) => ({
          id: d.id,
          depositDate: d.depositDate,
          salaryMonth: d.salaryMonth,
          amount: Number(d.amount),
          employer: d.employer,
        })),
        owners: account.owners.map((o) => ({
          id: o.profile.id,
          name: o.profile.name,
          image: o.profile.image,
          color: o.profile.color,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        householdId,
        totalValue: fromCents(totalValueCents),
        totalDeposits: fromCents(totalDepositsCents),
        thisMonthDeposits: fromCents(thisMonthDepositsCents),
        accountsCount: accounts.length,
        accounts: accountSummaries,
      },
    });
  } catch (error) {
    console.error('Error fetching pension data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pension data' },
      { status: 500 }
    );
  }
}
