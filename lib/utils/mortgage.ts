/**
 * Mortgage amortization simulation.
 *
 * We use the Spitzer method (constant total monthly payment) which is what
 * Israeli banks default to. For each month we compute:
 *   interest  = balance * annualRate / 12
 *   principal = payment - interest
 *   balance   = balance - principal
 *
 * A track's rate may evolve over time (PRIME_LINKED tracks track Bank of
 * Israel Prime + a fixed spread; VARIABLE_24M tracks reset every 24 months
 * to (anchor + spread) but the anchor is entered manually at each reset).
 * The simulator walks month-by-month from `originationDate` to the target
 * date, applying any rate change that fell inside a month before that
 * month's payment is computed.
 *
 * All monetary math runs in integer cents to avoid float drift over 360
 * iterations — a pattern established elsewhere in the codebase (budget
 * analysis, moneytor accumulation).
 */

export type RateType = 'FIXED' | 'PRIME_LINKED' | 'VARIABLE_24M';

export interface TrackInput {
  originationPrincipal: number; // ₪ (whole units, we scale internally)
  originationDate: Date;
  paymentDay: number; // 1-28
  termMonths: number;
  rateType: RateType;
  // For FIXED: the fixed rate. For PRIME_LINKED / VARIABLE_24M: current
  // effective rate at origination (equivalently prime@origination + spread).
  initialAnnualRate: number; // fraction, e.g. 0.048 for 4.8%
  rateSpread?: number; // fraction, added to Prime/anchor to derive rate
}

export interface PrimeRateEntry {
  rate: number; // fraction, e.g. 0.06 for 6%
  effectiveFrom: Date;
}

export interface AnchorResetEntry {
  // For VARIABLE_24M tracks: the new anchor rate the user entered when the
  // 24-month window rolled over. The effective rate for that window becomes
  // (anchor + spread).
  anchor: number;
  effectiveFrom: Date;
}

export interface SimulationResult {
  currentBalance: number; // ₪ (positive; caller may negate for debt display)
  paymentsMade: number;
  principalPaid: number;
  interestPaid: number;
  monthlyPayment: number; // The current (post-any-reset) monthly payment
  effectiveRate: number; // Current effective annual rate (fraction)
  nextPaymentDate: Date | null; // null if the loan is paid off
  nextResetDate: Date | null; // For VARIABLE_24M; null otherwise
}

const CENTS = 100;

/**
 * Standard Spitzer monthly-payment formula:
 *   P * r * (1 + r)^n / ((1 + r)^n - 1)
 * where r = monthly rate (annual/12) and n = remaining months.
 * If r is zero, the payment is just principal/n.
 */
export function spitzerPayment(
  principalCents: number,
  annualRate: number,
  remainingMonths: number
): number {
  if (remainingMonths <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return Math.round(principalCents / remainingMonths);
  const factor = Math.pow(1 + r, remainingMonths);
  return Math.round((principalCents * r * factor) / (factor - 1));
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function utcMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/**
 * The scheduled payment-date sequence: originationDate + i months, clamped
 * to `paymentDay`. Payment day is 1-28 so we don't need month-length rollover
 * handling.
 */
function paymentDateForMonth(originationDate: Date, paymentDay: number, i: number): Date {
  const start = utcMidnight(
    originationDate.getUTCFullYear(),
    originationDate.getUTCMonth(),
    paymentDay
  );
  return addMonths(start, i);
}

/**
 * For PRIME_LINKED tracks, find the Prime rate in effect at `date`.
 * `primeHistory` must be sorted ascending by `effectiveFrom`. Returns the
 * most recent entry whose effectiveFrom <= date, or null if none.
 */
function primeAt(date: Date, primeHistory: PrimeRateEntry[]): number | null {
  let current: number | null = null;
  for (const entry of primeHistory) {
    if (entry.effectiveFrom.getTime() <= date.getTime()) {
      current = entry.rate;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Effective annual rate for a track at a given point in time.
 */
function effectiveRateAt(
  input: TrackInput,
  date: Date,
  primeHistory: PrimeRateEntry[],
  anchorResets: AnchorResetEntry[]
): number {
  switch (input.rateType) {
    case 'FIXED':
      return input.initialAnnualRate;
    case 'PRIME_LINKED': {
      const p = primeAt(date, primeHistory);
      if (p == null || input.rateSpread == null) return input.initialAnnualRate;
      return p + input.rateSpread;
    }
    case 'VARIABLE_24M': {
      // Use the most recent anchor reset before `date`; fall back to the
      // initial rate (which already includes the origination-time anchor).
      let anchor: number | null = null;
      for (const r of anchorResets) {
        if (r.effectiveFrom.getTime() <= date.getTime()) anchor = r.anchor;
        else break;
      }
      if (anchor == null || input.rateSpread == null) return input.initialAnnualRate;
      return anchor + input.rateSpread;
    }
  }
}

/**
 * Run the amortization schedule forward from origination through `asOf`.
 * Every scheduled payment date strictly on or before `asOf` is applied.
 */
export function simulateTrack(
  input: TrackInput,
  asOf: Date,
  primeHistory: PrimeRateEntry[] = [],
  anchorResets: AnchorResetEntry[] = []
): SimulationResult {
  const principalCents = Math.round(input.originationPrincipal * CENTS);
  let balance = principalCents;
  let paymentsMade = 0;
  let principalPaid = 0;
  let interestPaid = 0;

  // Sort inputs — callers are trusted but a stray unsorted array shouldn't
  // silently corrupt the simulation.
  const primes = [...primeHistory].sort(
    (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime()
  );
  const anchors = [...anchorResets].sort(
    (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime()
  );

  let monthlyPayment = spitzerPayment(balance, input.initialAnnualRate, input.termMonths);
  let currentEffectiveRate = input.initialAnnualRate;

  for (let i = 1; i <= input.termMonths; i++) {
    const dueDate = paymentDateForMonth(input.originationDate, input.paymentDay, i);
    if (dueDate.getTime() > asOf.getTime()) break;

    // Recompute effective rate as of this payment date. If it changed since
    // the last month, re-amortize the remaining balance across the remaining
    // months so the monthly payment reflects the new rate — this mirrors
    // what an Israeli bank does when Prime moves.
    const effRate = effectiveRateAt(input, dueDate, primes, anchors);
    if (effRate !== currentEffectiveRate) {
      const remaining = input.termMonths - i + 1;
      monthlyPayment = spitzerPayment(balance, effRate, remaining);
      currentEffectiveRate = effRate;
    }

    const monthlyRate = currentEffectiveRate / 12;
    const interestCents = Math.round(balance * monthlyRate);
    let principalCentsThisMonth = monthlyPayment - interestCents;
    // Final payment: never overshoot the balance.
    if (principalCentsThisMonth > balance) principalCentsThisMonth = balance;

    balance -= principalCentsThisMonth;
    principalPaid += principalCentsThisMonth;
    interestPaid += interestCents;
    paymentsMade++;

    if (balance <= 0) {
      balance = 0;
      break;
    }
  }

  const nextPaymentIndex = paymentsMade + 1;
  const nextPaymentDate =
    balance > 0 && nextPaymentIndex <= input.termMonths
      ? paymentDateForMonth(input.originationDate, input.paymentDay, nextPaymentIndex)
      : null;

  const nextResetDate =
    input.rateType === 'VARIABLE_24M'
      ? // Find the next 24-month boundary strictly after asOf.
        (() => {
          let candidate = addMonths(input.originationDate, 24);
          while (candidate.getTime() <= asOf.getTime()) {
            candidate = addMonths(candidate, 24);
          }
          return candidate;
        })()
      : null;

  return {
    currentBalance: balance / CENTS,
    paymentsMade,
    principalPaid: principalPaid / CENTS,
    interestPaid: interestPaid / CENTS,
    monthlyPayment: monthlyPayment / CENTS,
    effectiveRate: currentEffectiveRate,
    nextPaymentDate,
    nextResetDate,
  };
}
