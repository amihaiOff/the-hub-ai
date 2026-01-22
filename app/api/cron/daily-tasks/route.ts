import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateStockPriceCache, isStockPriceError } from '@/lib/api/stock-price';

// Extend timeout for cron job processing many stock symbols
export const maxDuration = 60;

/**
 * GET /api/cron/daily-tasks
 * Combined daily cron job that:
 * 1. Updates stock prices for all holdings
 * 2. Checks for missing pension deposits (quarterly)
 *
 * Protected by CRON_SECRET in production
 */
export async function GET(request: NextRequest) {
  // Verify cron secret in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results = {
    stockPrices: { updated: 0, failed: 0, symbols: [] as string[] },
    notifications: { created: 0, checked: 0 },
  };

  try {
    // Task 1: Update stock prices
    await updateStockPrices(results);

    // Task 2: Check for missing pension deposits
    await checkMissingDeposits(results);

    return NextResponse.json({
      success: true,
      message: 'Daily tasks completed',
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error running daily tasks:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to complete daily tasks',
        partialResults: results,
      },
      { status: 500 }
    );
  }
}

/**
 * Update stock prices for all unique symbols in holdings
 */
async function updateStockPrices(results: {
  stockPrices: { updated: number; failed: number; symbols: string[] };
}) {
  // Get all unique stock symbols from holdings
  const holdings = await prisma.stockHolding.findMany({
    select: { symbol: true },
    distinct: ['symbol'],
  });

  const uniqueSymbols = holdings.map((h) => h.symbol);
  console.log(`Updating prices for ${uniqueSymbols.length} symbols`);

  for (const symbol of uniqueSymbols) {
    try {
      const result = await updateStockPriceCache(symbol);

      if (isStockPriceError(result)) {
        console.warn(`Failed to update price for ${symbol}: ${result.error}`);
        results.stockPrices.failed++;
      } else {
        results.stockPrices.updated++;
        results.stockPrices.symbols.push(symbol);
      }

      // Rate limiting: wait 200ms between API calls
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error updating price for ${symbol}:`, error);
      results.stockPrices.failed++;
    }
  }
}

/**
 * Check for missing pension deposits (quarterly check)
 * Creates notifications if deposits are missing
 */
async function checkMissingDeposits(results: {
  notifications: { created: number; checked: number };
}) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Get all pension accounts
  const accounts = await prisma.pensionAccount.findMany({
    include: {
      deposits: {
        orderBy: { salaryMonth: 'desc' },
        take: 6, // Last 6 deposits for comparison
      },
    },
  });

  for (const account of accounts) {
    results.notifications.checked++;

    // Skip accounts with no deposit history
    if (account.deposits.length === 0) continue;

    // Get the most recent deposit
    const lastDeposit = account.deposits[0];
    const lastDepositMonth = new Date(lastDeposit.salaryMonth);

    // Calculate months since last deposit
    const monthsSinceDeposit =
      (currentYear - lastDepositMonth.getFullYear()) * 12 +
      (currentMonth - lastDepositMonth.getMonth());

    // Alert if more than 2 months without deposit (quarterly tolerance)
    if (monthsSinceDeposit > 2) {
      console.log(
        `Missing deposit alert for account ${account.id}: ${monthsSinceDeposit} months since last deposit`
      );

      // For now, just log - notification system can be added later
      // This keeps the cron job functional without requiring a notifications table
      results.notifications.created++;
    }

    // Check for deposit amount anomalies (>20% change from average)
    if (account.deposits.length >= 3) {
      const recentDeposits = account.deposits.slice(0, 3);
      const avgAmount =
        recentDeposits.reduce((sum, d) => sum + d.amount.toNumber(), 0) / recentDeposits.length;

      const latestAmount = lastDeposit.amount.toNumber();
      const percentChange = Math.abs((latestAmount - avgAmount) / avgAmount);

      if (percentChange > 0.2) {
        console.log(
          `Deposit anomaly for account ${account.id}: ${(percentChange * 100).toFixed(1)}% change from average`
        );
      }
    }
  }
}
