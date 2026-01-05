import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/pension
 * Get user's pension summary with all accounts and deposits
 */
export async function GET(_request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all pension accounts with deposits for the user
    const accounts = await prisma.pensionAccount.findMany({
      where: { userId: user.id },
      include: {
        deposits: {
          orderBy: { salaryMonth: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate totals
    let totalValue = 0;
    let totalDeposits = 0;
    let thisMonthDeposits = 0;

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const accountSummaries = accounts.map((account) => {
      const accountTotalDeposits = account.deposits.reduce((sum, d) => sum + Number(d.amount), 0);

      const accountThisMonth = account.deposits
        .filter((d) => {
          const depositMonth = new Date(d.salaryMonth);
          return (
            depositMonth.getFullYear() === currentMonth.getFullYear() &&
            depositMonth.getMonth() === currentMonth.getMonth()
          );
        })
        .reduce((sum, d) => sum + Number(d.amount), 0);

      totalValue += Number(account.currentValue);
      totalDeposits += accountTotalDeposits;
      thisMonthDeposits += accountThisMonth;

      return {
        id: account.id,
        type: account.type,
        providerName: account.providerName,
        accountName: account.accountName,
        currentValue: Number(account.currentValue),
        feeFromDeposit: Number(account.feeFromDeposit),
        feeFromTotal: Number(account.feeFromTotal),
        totalDeposits: accountTotalDeposits,
        depositsCount: account.deposits.length,
        deposits: account.deposits.map((d) => ({
          id: d.id,
          depositDate: d.depositDate,
          salaryMonth: d.salaryMonth,
          amount: Number(d.amount),
          employer: d.employer,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        totalValue,
        totalDeposits,
        thisMonthDeposits,
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
