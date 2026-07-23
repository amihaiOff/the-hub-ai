/**
 * Bank of Israel Prime rate feed.
 *
 * The rate changes 3–6 times a year (Monetary Committee decisions). Prime is
 * historically Bank of Israel base rate + 1.5%. As of writing there is no
 * frictionless public JSON endpoint for Prime specifically — the base rate is
 * on boi.org.il and Prime is derived from it — so we support two feeds:
 *
 * 1. `BOI_PRIME_RATE_OVERRIDE` env var (as a percentage, e.g. "5.5")
 *    — the operator sets this after each rate decision. Simple, reliable.
 * 2. A future scraped/API source can be plugged in here without touching the
 *    cron. Return null to indicate "no update available".
 *
 * Returning null from this function means "keep the previously stored rate"
 * — the cron treats an absent reading as a no-op, not an error.
 */

import { prisma } from '@/lib/db';

export interface PrimeRateReading {
  rate: number; // fraction, e.g. 0.06 for 6%
  effectiveFrom: Date;
}

export async function fetchBoiPrime(): Promise<PrimeRateReading | null> {
  const override = process.env.BOI_PRIME_RATE_OVERRIDE;
  if (override) {
    const parsed = parseFloat(override);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 25) {
      return { rate: parsed / 100, effectiveFrom: new Date() };
    }
  }
  return null;
}

/**
 * Insert a new market_rates row when Prime has actually moved. Idempotent —
 * safe to call every day; a same-rate reading is a no-op.
 * Returns { inserted, rate, previousRate } for cron logging.
 */
export async function upsertBoiPrimeIfChanged(reading: PrimeRateReading | null): Promise<{
  inserted: boolean;
  rate: number | null;
  previousRate: number | null;
}> {
  if (!reading) return { inserted: false, rate: null, previousRate: null };

  const latest = await prisma.marketRate.findFirst({
    where: { name: 'BOI_PRIME' },
    orderBy: { effectiveFrom: 'desc' },
  });
  const previousRate = latest ? latest.rate.toNumber() : null;

  // Insert only when the reading differs from the most recent row (or when
  // there's no row yet). Round both sides to 4 decimals — the schema stores
  // 4 fractional digits.
  const roundedNew = Math.round(reading.rate * 1e4) / 1e4;
  if (previousRate != null && Math.round(previousRate * 1e4) / 1e4 === roundedNew) {
    return { inserted: false, rate: roundedNew, previousRate };
  }

  await prisma.marketRate.create({
    data: {
      name: 'BOI_PRIME',
      rate: roundedNew,
      effectiveFrom: reading.effectiveFrom,
    },
  });
  return { inserted: true, rate: roundedNew, previousRate };
}

/**
 * Fetch full Prime history (ascending by effective date) so callers can pass
 * it to `simulateTrack` for PRIME_LINKED tracks.
 */
export async function loadBoiPrimeHistory(): Promise<PrimeRateReading[]> {
  const rows = await prisma.marketRate.findMany({
    where: { name: 'BOI_PRIME' },
    orderBy: { effectiveFrom: 'asc' },
  });
  return rows.map((r) => ({ rate: r.rate.toNumber(), effectiveFrom: r.effectiveFrom }));
}
