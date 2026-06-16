import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/budget/account-names/identifiers
 * Returns the distinct payment identifiers found on the household's transactions, each with a
 * transaction count and a sample payee name. Used by the settings UI to offer a pick-list so the
 * user can recognize which account/card each opaque identifier belongs to.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const grouped = await prisma.budgetTransaction.groupBy({
      by: ['paymentIdentifier'],
      where: {
        householdId,
        isDeleted: false,
        paymentIdentifier: { not: null },
      },
      _count: { _all: true },
    });

    // Attach a sample payee name for each identifier to help the user recognize it.
    // The number of distinct identifiers per household is small (a handful of cards/accounts).
    const identifiers = await Promise.all(
      grouped.map(async (g) => {
        const sample = await prisma.budgetTransaction.findFirst({
          where: { householdId, isDeleted: false, paymentIdentifier: g.paymentIdentifier },
          orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
          select: { payee: { select: { name: true } } },
        });
        return {
          accountNumber: g.paymentIdentifier as string,
          count: g._count._all,
          samplePayee: sample?.payee?.name ?? null,
        };
      })
    );

    identifiers.sort((a, b) => b.count - a.count);

    return NextResponse.json({ success: true, data: identifiers });
  } catch (error) {
    console.error('Error fetching account identifiers:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch' }, { status: 500 });
  }
}
