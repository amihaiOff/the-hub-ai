import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/labs/dropped-transactions
 * Returns recent drop-log entries for the active household — budget rows
 * that were removed because their Moneytor row disappeared on a re-sync.
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await prisma.moneytorDropLog.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: { droppedAt: 'desc' },
    take: 200,
    select: {
      id: true,
      transactionDate: true,
      amountIls: true,
      payeeName: true,
      description: true,
      reason: true,
      droppedAt: true,
      originalMoneytorId: true,
    },
  });
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      transactionDate: r.transactionDate.toISOString().split('T')[0],
      amountIls: Number(r.amountIls),
      payeeName: r.payeeName,
      description: r.description,
      reason: r.reason,
      droppedAt: r.droppedAt.toISOString(),
      originalMoneytorId: r.originalMoneytorId,
    })),
  });
}
