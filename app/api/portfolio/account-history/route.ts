import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { fetchExchangeRates, convertPrice, type ExchangeRates } from '@/lib/api/exchange-rates';

const RANGE_DAYS: Record<string, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '3Y': 365 * 3,
  '5Y': 365 * 5,
  ALL: 0,
};

// Mirrors lib/api/stock-price.ts inferCurrencyFromSymbol — Yahoo Finance prices in
// stock_price_history are stored in the symbol's native currency, so we need to know
// what that currency is to convert to ILS.
function inferCurrency(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.endsWith('.L')) return 'GBP';
  if (s.endsWith('.TA')) return 'ILS';
  if (s.endsWith('.PA') || s.endsWith('.DE') || s.endsWith('.AS') || s.endsWith('.MI')) {
    return 'EUR';
  }
  return 'USD';
}

const DEFAULT_RATES: ExchangeRates = { USD: 3.7, EUR: 4.0, GBP: 4.6, ILS: 1 };

/**
 * GET /api/portfolio/account-history?range=1Y
 *
 * Returns daily total ILS value per legacy stock account, built from
 * stock_price_history × current holdings quantities. Cash is treated as a flat
 * baseline (we don't track historical cash balances).
 *
 * Caveat: uses current quantities and current exchange rates for every historical
 * point, so the chart reflects "what your portfolio would have been worth if you'd
 * held today's positions at historical prices" — not a true historical mark.
 * Good enough for sparkline trend visualisation.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const range = request.nextUrl.searchParams.get('range') ?? '1Y';
    const days = RANGE_DAYS[range] ?? RANGE_DAYS['1Y'];
    const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : new Date(0);

    const accounts = await prisma.stockAccount.findMany({
      where: { userId: user.id },
      include: { holdings: true, cashBalances: true },
      orderBy: { createdAt: 'asc' },
    });

    const allSymbols = Array.from(
      new Set(accounts.flatMap((a) => a.holdings.map((h) => h.symbol)))
    );

    if (allSymbols.length === 0) {
      return NextResponse.json({ ok: true, range, accounts: [] });
    }

    const [priceRows, ratesOrNull] = await Promise.all([
      prisma.stockPriceHistory.findMany({
        where: { symbol: { in: allSymbols }, timestamp: { gte: since } },
        orderBy: { timestamp: 'asc' },
        select: { symbol: true, timestamp: true, price: true },
      }),
      fetchExchangeRates(),
    ]);
    const rates = ratesOrNull ?? DEFAULT_RATES;

    // Collapse to one price per (symbol, date) by taking the last price stored that day.
    const symbolDailyPrices = new Map<string, Array<{ date: string; price: number }>>();
    for (const r of priceRows) {
      const date = r.timestamp.toISOString().split('T')[0];
      const arr = symbolDailyPrices.get(r.symbol) ?? [];
      const last = arr[arr.length - 1];
      if (last && last.date === date) {
        last.price = Number(r.price);
      } else {
        arr.push({ date, price: Number(r.price) });
      }
      symbolDailyPrices.set(r.symbol, arr);
    }

    const result = accounts.map((account) => {
      // Current cash, applied as flat baseline across the range
      const cashIls = account.cashBalances.reduce((s, cb) => {
        return s + convertPrice(Number(cb.amount), cb.currency, 'ILS', rates);
      }, 0);

      // Union of all dates that have a price for any symbol in this account
      const dateSet = new Set<string>();
      for (const h of account.holdings) {
        for (const p of symbolDailyPrices.get(h.symbol) ?? []) {
          dateSet.add(p.date);
        }
      }

      const sortedDates = Array.from(dateSet).sort();
      const points: Array<{ date: string; value: number }> = [];

      for (const date of sortedDates) {
        let holdingsIls = 0;
        let allHaveData = true;

        for (const h of account.holdings) {
          const symPrices = symbolDailyPrices.get(h.symbol) ?? [];
          // Latest price on or before `date` — linear walk back since arrays are tiny.
          let priceOnDate: number | null = null;
          for (let i = symPrices.length - 1; i >= 0; i--) {
            if (symPrices[i].date <= date) {
              priceOnDate = symPrices[i].price;
              break;
            }
          }
          if (priceOnDate === null) {
            allHaveData = false;
            break;
          }
          const symCurrency = inferCurrency(h.symbol);
          const valueIls =
            Number(h.quantity) * convertPrice(priceOnDate, symCurrency, 'ILS', rates);
          holdingsIls += valueIls;
        }

        if (allHaveData) {
          points.push({ date, value: holdingsIls + cashIls });
        }
      }

      return { accountId: account.id, points };
    });

    return NextResponse.json({ ok: true, range, accounts: result });
  } catch (err) {
    console.error('Legacy account-history failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Failed to load account history. Check server logs.' },
      { status: 500 }
    );
  }
}
