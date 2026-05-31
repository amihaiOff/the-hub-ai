import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

/**
 * GET /api/moneytor/transactions
 * List Moneytor-synced transactions with filters.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { searchParams } = new URL(request.url);

    const month = searchParams.get('month'); // YYYY-MM
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const parsedLimit = parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 5000)) : 1000;
    const parsedOffset = parseInt(searchParams.get('offset') ?? '', 10);
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;

    const where: Prisma.MoneytorTransactionWhereInput = { householdId };

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, monthNum] = month.split('-').map(Number);
      const start = new Date(year, monthNum - 1, 1);
      const end = new Date(year, monthNum, 0);
      where.transactionDate = { gte: start, lte: end };
    } else {
      if (startDate) {
        where.transactionDate = { ...(where.transactionDate as object), gte: new Date(startDate) };
      }
      if (endDate) {
        where.transactionDate = { ...(where.transactionDate as object), lte: new Date(endDate) };
      }
    }

    if (category) where.category = category;
    if (type) where.type = type;
    if (search) where.description = { contains: search, mode: 'insensitive' };

    const [rows, total, categoriesRaw, latestSync] = await Promise.all([
      prisma.moneytorTransaction.findMany({
        where,
        orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.moneytorTransaction.count({ where: { householdId } }),
      prisma.moneytorTransaction.findMany({
        where: { householdId },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
      prisma.moneytorTransaction.findFirst({
        where: { householdId },
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true },
      }),
    ]);

    const transactions = rows.map((r) => ({
      id: r.id,
      transactionDate: r.transactionDate.toISOString().split('T')[0],
      amount: Number(r.amount),
      currency: r.currency,
      description: r.description,
      category: r.category,
      accountId: r.accountId,
      type: r.type,
      syncedAt: r.syncedAt.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      transactions,
      total,
      categories: categoriesRaw.map((c) => c.category),
      latestSyncedAt: latestSync?.syncedAt.toISOString() ?? null,
    });
  } catch (err) {
    console.error('Moneytor list failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
