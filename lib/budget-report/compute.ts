/**
 * Deterministic baseline for the monthly budget report.
 *
 * Pure functions over plain rows (no Prisma) so the numbers are reproducible
 * month to month and unit-testable. The report agent gets these as a starting
 * point and is free to dig further on the raw data.
 *
 * Rules (see docs/decisions.md → Budget reports):
 * - A "month" is the household's billing cycle for EVERY payment method
 *   (bank rows too), unlike the Budget summary.
 * - Compared against the 3 cycles before it.
 * - Categories flagged `excluded` are dropped entirely (income and expense).
 * - The "Savings" category is savings, not spending.
 * - Uncategorized-but-tagged expenses are one-offs (e.g. a trip), reported
 *   separately.
 * - An expense paid back by an insurer (income from an insurer of the same
 *   amount within 45 days after it) or cancelled ("ביטול עסקה") is netted
 *   out; the refund isn't counted as income.
 * - A pending row with a settled twin (same amount, similar payee name, within
 *   7 days) is a likely duplicate and left out of the totals.
 */
import { monthToCycleRange, transactionBudgetMonth } from '@/lib/utils/billing-cycle';

export interface ReportTx {
  id: string;
  type: 'income' | 'expense';
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  currency: string;
  amountOriginal: number;
  categoryId: string | null;
  payee: string | null;
  notes: string | null;
  tags: string[];
  paymentMethod: string;
  paymentNumber: number | null;
  totalPayments: number | null;
  /** Synced row that has its final bank id (false = pending or manual). */
  settled: boolean;
}

export interface ReportCategory {
  id: string;
  name: string;
  group: string;
  budget: number | null;
  isMust: boolean;
  excluded: boolean;
  everyMonths: number;
}

export type BudgetStatus = 'over' | 'near' | 'under' | 'none' | 'no_budget';

export interface CategoryStat {
  id: string;
  name: string;
  group: string;
  budget: number | null;
  everyMonths: number;
  /** Spend per cycle, oldest first; the last entry is the report month. */
  history: number[];
  actual: number;
  avg3: number;
  /** Bimonthly categories: 4-cycle average; otherwise = actual. */
  monthly: number;
  reimbursed: number;
  status: BudgetStatus;
}

export interface DuplicatePair {
  confidence: 'likely' | 'possible';
  amount: number;
  category: string | null;
  first: { id: string; date: string; payee: string | null; settled: boolean };
  second: { id: string; date: string; payee: string | null; settled: boolean };
  /** Row left out of the totals ('likely' only). */
  excludedId: string | null;
}

export interface RefundMatch {
  kind: 'insurance' | 'cancellation';
  amount: number;
  refundDate: string;
  refundPayee: string | null;
  expenseDate: string | null;
  expensePayee: string | null;
  expenseCategory: string | null;
}

export interface CycleTotals {
  month: string;
  everyday: number;
  income: number;
  savings: number;
  oneOffs: number;
}

export interface ReportStats {
  month: string;
  cycleStart: string;
  /** Inclusive last day. */
  cycleEnd: string;
  months: string[];
  totals: CycleTotals[];
  everyday: number;
  everydayAvg3: number;
  budgetTotal: number;
  income: number;
  savings: number;
  /** All income minus all spending (savings transfers aren't spending). */
  cashFlow: number;
  categories: CategoryStat[];
  uncategorized: { total: number; count: number };
  oneOffs: { tag: string; total: number; count: number }[];
  weeks: { start: string; end: string; flexible: number; oneOffs: number }[];
  duplicates: DuplicatePair[];
  refunds: RefundMatch[];
  notSeen: { name: string; kind: 'category' | 'payee'; avg3: number; lastDate: string | null }[];
  installments: {
    payee: string | null;
    amount: number;
    paymentNumber: number;
    totalPayments: number;
  }[];
  excludedCategories: string[];
}

const SAVINGS_CATEGORY = 'Savings';
const DUP_WINDOW_DAYS = 7;
const REFUND_WINDOW_DAYS = 45;
// Insurer payees as they appear on bank statements. Kept to distinctive names:
// bare "כלל"/"מגדל" would also match words like מכללה or מגדלי.
const INSURER = /ביטוח|הפניקס|הראל|מנורה|איילון|insur/i;
const CANCELLATION = /ביטול עסקה|refund/i;
const INSTALLMENT_NOTE = /תשלום\s+(\d+)\s+מתוך\s+(\d+)/;

const round = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** The month string `n` months before `month`. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** [from, to) of the 4-cycle window ending with `month`, as YYYY-MM-DD. */
export function reportWindow(month: string, startDay: number) {
  const from = monthToCycleRange(shiftMonth(month, 3), startDay).from;
  const to = monthToCycleRange(month, startDay).to;
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** The report month a row belongs to: the cycle applies to every payment method. */
export function cycleOf(date: string, startDay: number): string | null {
  return transactionBudgetMonth(date, 'credit_card', startDay);
}

/** Lower-cased letters/digits only, so "WIZZ AIR  ZWW" ~ "wizzairzww". */
function normalizeName(name: string | null): string {
  return (name ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Card feeds truncate (or, for Hebrew, reverse) a shop's name between the
 * pending and settled row, so compare on a shared prefix.
 */
export function similarPayee(a: string | null, b: string | null): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const n = Math.min(short.length, 8);
  if (n < 3) return short === long;
  const reversed = [...short].reverse().join('');
  return long.startsWith(short.slice(0, n)) || long.startsWith(reversed.slice(0, n));
}

export function findDuplicates(rows: ReportTx[]): DuplicatePair[] {
  const expenses = rows
    .filter((t) => t.type === 'expense')
    .sort((a, b) => a.date.localeCompare(b.date));
  const pairs: DuplicatePair[] = [];
  const used = new Set<string>();
  for (let i = 0; i < expenses.length; i++) {
    const a = expenses[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < expenses.length; j++) {
      const b = expenses[j];
      const gap = dayDiff(a.date, b.date);
      if (gap > DUP_WINDOW_DAYS) break;
      if (used.has(b.id) || Math.abs(a.amount - b.amount) > 0.005) continue;
      if (!similarPayee(a.payee, b.payee)) continue;
      const oneSettled = a.settled !== b.settled;
      // Both settled with the same name a week apart is usually a real repeat
      // purchase (coffee, a Wolt order); only flag those when close together.
      if (!oneSettled && gap > 2) continue;
      const pending = oneSettled ? (a.settled ? b : a) : null;
      pairs.push({
        confidence: oneSettled ? 'likely' : 'possible',
        amount: round(a.amount),
        category: a.categoryId,
        first: { id: a.id, date: a.date, payee: a.payee, settled: a.settled },
        second: { id: b.id, date: b.date, payee: b.payee, settled: b.settled },
        excludedId: pending?.id ?? null,
      });
      used.add(a.id);
      used.add(b.id);
      break;
    }
  }
  return pairs;
}

/**
 * Match insurer payouts and card cancellations to the expense they pay back.
 * Returns refund id → expense (null for a cancellation with no visible charge).
 * Other income that happens to equal an expense (a standing order, a friend's
 * transfer) is left to the agent — matching it here would hide real income.
 */
export function matchRefunds(rows: ReportTx[]): Map<string, ReportTx | null> {
  const expenses = rows.filter((t) => t.type === 'expense');
  const taken = new Set<string>();
  const out = new Map<string, ReportTx | null>();
  for (const inc of rows.filter((t) => t.type === 'income')) {
    const isCancel = CANCELLATION.test(`${inc.payee ?? ''} ${inc.notes ?? ''}`);
    if (!isCancel && !INSURER.test(inc.payee ?? '')) continue;
    // Cancellations can differ by FX rounding; insurer payouts match exactly.
    const tolerance = isCancel ? Math.max(1, inc.amount * 0.01) : 0.005;
    const candidates = expenses.filter(
      (e) =>
        !taken.has(e.id) &&
        Math.abs(e.amount - inc.amount) <= tolerance &&
        dayDiff(e.date, inc.date) >= 0 &&
        dayDiff(e.date, inc.date) <= REFUND_WINDOW_DAYS
    );
    // Prefer the closest-in-time expense, and a same-payee one for cancellations.
    candidates.sort(
      (a, b) =>
        Number(similarPayee(b.payee, inc.payee)) - Number(similarPayee(a.payee, inc.payee)) ||
        dayDiff(b.date, inc.date) - dayDiff(a.date, inc.date)
    );
    const match = candidates[0];
    if (match) {
      taken.add(match.id);
      out.set(inc.id, match);
    } else if (isCancel) {
      out.set(inc.id, null);
    }
  }
  return out;
}

function budgetStatus(spend: number, budget: number | null): BudgetStatus {
  if (budget == null || budget <= 0) return 'no_budget';
  if (spend <= 0) return 'none';
  const p = spend / budget;
  return p > 1.1 ? 'over' : p >= 0.9 ? 'near' : 'under';
}

export function computeReportStats(
  month: string,
  startDay: number,
  allRows: ReportTx[],
  categories: ReportCategory[]
): ReportStats {
  const months = [3, 2, 1, 0].map((n) => shiftMonth(month, n));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const excludedIds = new Set(categories.filter((c) => c.excluded).map((c) => c.id));
  const savingsIds = new Set(
    categories.filter((c) => c.name === SAVINGS_CATEGORY).map((c) => c.id)
  );

  const cycle = new Map<string, string | null>();
  const rows = allRows.filter((t) => {
    if (t.categoryId && excludedIds.has(t.categoryId)) return false;
    const c = cycleOf(t.date, startDay);
    cycle.set(t.id, c);
    return c !== null && months.includes(c);
  });
  const inMonth = (t: ReportTx) => cycle.get(t.id) === month;

  const allDuplicates = findDuplicates(rows);
  const duplicates = allDuplicates.filter(
    (d) => cycle.get(d.second.id) === month || cycle.get(d.first.id) === month
  );
  const dupIds = new Set(allDuplicates.map((d) => d.excludedId).filter((x): x is string => !!x));

  const refundMap = matchRefunds(rows);
  const refundIds = new Set(refundMap.keys());
  // Net an expense out only when its refund lands in the same cycle. The window
  // ends with the report cycle, so a refund arriving next month can't be seen
  // yet; netting earlier cycles' expenses against later refunds would make the
  // 3-cycle baseline look lower than the current month can ever be.
  const reimbursedIds = new Set(
    [...refundMap.entries()]
      .filter(([incId, e]) => e && cycle.get(e.id) === cycle.get(incId))
      .map(([, e]) => e!.id)
  );

  const isOneOff = (t: ReportTx) => !t.categoryId && t.tags.length > 0;
  const isSavings = (t: ReportTx) => !!t.categoryId && savingsIds.has(t.categoryId);
  const counted = (t: ReportTx) => t.type === 'expense' && !dupIds.has(t.id);
  const isEveryday = (t: ReportTx) =>
    counted(t) && !isOneOff(t) && !isSavings(t) && !reimbursedIds.has(t.id);
  const isOneOffSpend = (t: ReportTx) => counted(t) && isOneOff(t) && !reimbursedIds.has(t.id);

  const totals: CycleTotals[] = months.map((m) => {
    const r = rows.filter((t) => cycle.get(t.id) === m);
    return {
      month: m,
      everyday: round(sum(r.filter(isEveryday).map((t) => t.amount))),
      income: round(
        sum(r.filter((t) => t.type === 'income' && !refundIds.has(t.id)).map((t) => t.amount))
      ),
      savings: round(sum(r.filter((t) => counted(t) && isSavings(t)).map((t) => t.amount))),
      oneOffs: round(sum(r.filter(isOneOffSpend).map((t) => t.amount))),
    };
  });
  const cur = totals[3];
  const target = rows.filter(inMonth);

  const categoryStats: CategoryStat[] = categories
    .filter((c) => !c.excluded && !savingsIds.has(c.id))
    .map((c) => {
      const history = months.map((m) =>
        round(
          sum(
            rows
              .filter((t) => t.categoryId === c.id && cycle.get(t.id) === m && counted(t))
              .map((t) => t.amount)
          )
        )
      );
      const actual = history[3];
      const avg3 = round(sum(history.slice(0, 3)) / 3);
      const monthly = c.everyMonths > 1 ? round(sum(history) / 4) : actual;
      // Same units as `monthly`: a bimonthly category's refunds are averaged too.
      const refunded = (m: string) =>
        sum(
          rows
            .filter(
              (t) => t.categoryId === c.id && cycle.get(t.id) === m && reimbursedIds.has(t.id)
            )
            .map((t) => t.amount)
        );
      const reimbursed = round(c.everyMonths > 1 ? sum(months.map(refunded)) / 4 : refunded(month));
      return {
        id: c.id,
        name: c.name,
        group: c.group,
        budget: c.budget,
        everyMonths: c.everyMonths,
        history,
        actual,
        avg3,
        monthly,
        reimbursed,
        status: budgetStatus(monthly - reimbursed, c.budget),
      };
    })
    .filter((c) => c.budget || c.history.some((h) => h > 0));

  const uncats = target.filter((t) => counted(t) && !t.categoryId && !isOneOff(t));
  const oneOffMap = new Map<string, { total: number; count: number }>();
  for (const t of target.filter(isOneOffSpend)) {
    const tag = t.tags[0];
    const e = oneOffMap.get(tag) ?? { total: 0, count: 0 };
    e.total += t.amount;
    e.count += 1;
    oneOffMap.set(tag, e);
  }

  // Week strip: flexible (non-"must") everyday spending plus one-offs, so a
  // rent payment doesn't swamp the week it lands in.
  const range = monthToCycleRange(month, startDay);
  const start = range.from.toISOString().slice(0, 10);
  const lastDay = new Date(range.to.getTime() - 86_400_000).toISOString().slice(0, 10);
  const weeks: ReportStats['weeks'] = [];
  for (let d = new Date(range.from); d < range.to; d = new Date(d.getTime() + 7 * 86_400_000)) {
    const ws = d.toISOString().slice(0, 10);
    const weMs = Math.min(d.getTime() + 6 * 86_400_000, range.to.getTime() - 86_400_000);
    const we = new Date(weMs).toISOString().slice(0, 10);
    const inWeek = target.filter((t) => t.date >= ws && t.date <= we);
    const flexible = inWeek.filter(
      (t) => isEveryday(t) && !(t.categoryId && catById.get(t.categoryId)?.isMust)
    );
    weeks.push({
      start: ws,
      end: we,
      flexible: round(sum(flexible.map((t) => t.amount))),
      oneOffs: round(sum(inWeek.filter(isOneOffSpend).map((t) => t.amount))),
    });
  }

  const refunds: RefundMatch[] = [...refundMap.entries()]
    .map(([incId, exp]) => ({ inc: rows.find((t) => t.id === incId)!, exp }))
    .filter(({ inc, exp }) => inMonth(inc) || (exp && inMonth(exp)))
    .map(({ inc, exp }) => ({
      kind: CANCELLATION.test(`${inc.payee ?? ''} ${inc.notes ?? ''}`)
        ? ('cancellation' as const)
        : ('insurance' as const),
      amount: round(inc.amount),
      refundDate: inc.date,
      refundPayee: inc.payee,
      expenseDate: exp?.date ?? null,
      expensePayee: exp?.payee ?? null,
      expenseCategory: exp?.categoryId ? (catById.get(exp.categoryId)?.name ?? null) : null,
    }));

  // Regular things that didn't show up: categories and payees seen in at least
  // two of the three previous cycles but not this one.
  const notSeen: ReportStats['notSeen'] = [];
  for (const c of categoryStats) {
    if (c.everyMonths > 1 || c.actual > 0) continue;
    if (c.history.slice(0, 3).filter((h) => h > 0).length >= 2) {
      const last = rows
        .filter((t) => t.categoryId === c.id && counted(t))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      notSeen.push({ name: c.name, kind: 'category', avg3: c.avg3, lastDate: last?.date ?? null });
    }
  }
  const seenCats = new Set(notSeen.map((n) => n.name));
  const byPayee = new Map<string, ReportTx[]>();
  for (const t of rows.filter((t) => counted(t) && !isSavings(t) && t.payee)) {
    const list = byPayee.get(t.payee!) ?? [];
    list.push(t);
    byPayee.set(t.payee!, list);
  }
  for (const [payee, list] of byPayee) {
    const per = months.map((m) =>
      sum(list.filter((t) => cycle.get(t.id) === m).map((t) => t.amount))
    );
    const avg3 = round(sum(per.slice(0, 3)) / 3);
    const cat = list[0].categoryId ? catById.get(list[0].categoryId) : undefined;
    if (per[3] > 0 || avg3 < 100 || per.slice(0, 3).filter((x) => x > 0).length < 2) continue;
    if ((cat && seenCats.has(cat.name)) || (cat && cat.everyMonths > 1)) continue;
    const last = list.sort((a, b) => b.date.localeCompare(a.date))[0];
    notSeen.push({ name: payee, kind: 'payee', avg3, lastDate: last.date });
  }

  const income = cur.income;
  const allSpend = sum(target.filter((t) => counted(t) && !isSavings(t)).map((t) => t.amount));
  const allIncome = sum(target.filter((t) => t.type === 'income').map((t) => t.amount));

  return {
    month,
    cycleStart: start,
    cycleEnd: lastDay,
    months,
    totals,
    everyday: cur.everyday,
    everydayAvg3: round(sum(totals.slice(0, 3).map((t) => t.everyday)) / 3),
    budgetTotal: round(
      sum(categories.filter((c) => !c.excluded && !savingsIds.has(c.id)).map((c) => c.budget ?? 0))
    ),
    income,
    savings: cur.savings,
    cashFlow: round(allIncome - allSpend),
    categories: categoryStats,
    uncategorized: { total: round(sum(uncats.map((t) => t.amount))), count: uncats.length },
    oneOffs: [...oneOffMap.entries()].map(([tag, e]) => ({
      tag,
      total: round(e.total),
      count: e.count,
    })),
    weeks,
    duplicates: duplicates.map((d) => ({
      ...d,
      category: d.category ? (catById.get(d.category)?.name ?? null) : null,
    })),
    refunds,
    notSeen: notSeen.slice(0, 15),
    installments: target.flatMap((t) => {
      // Card feeds put "תשלום 1 מתוך 2" in the notes instead of the fields.
      const m = INSTALLMENT_NOTE.exec(t.notes ?? '');
      const n = t.paymentNumber ?? (m ? Number(m[1]) : null);
      const of = t.totalPayments ?? (m ? Number(m[2]) : null);
      return t.type === 'expense' && n && of && n < of
        ? [{ payee: t.payee, amount: round(t.amount), paymentNumber: n, totalPayments: of }]
        : [];
    }),
    excludedCategories: categories.filter((c) => c.excluded).map((c) => c.name),
  };
}

/** The most recent cycle that has fully closed by `today`. */
export function lastClosedMonth(today: Date, startDay: number): string {
  // The household's local date: a cycle closes at midnight Israel time, not UTC.
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(today);
  const current = cycleOf(local, startDay)!;
  const [y, m] = current.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
