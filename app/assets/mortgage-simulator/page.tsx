'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, Home, HelpCircle, X } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────
interface ScheduleEntry {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

interface ComparisonEntry {
  month: number;
  year: string;
  basePayment: number;
  newPayment: number;
  baseInterest: number;
  newInterest: number;
  monthlySavings: number;
  baseTotalInterest: number;
  newTotalInterest: number;
  baseTotalPaid: number;
  newTotalPaid: number;
}

interface YearlyDataEntry {
  year: number;
  basePayment: number;
  newPayment: number;
  baseCumInterest: number;
  newCumInterest: number;
  interestSaved: number;
  investmentValue: number;
  reinvestedSavings: number;
}

interface SavingsGrowthEntry {
  month: number;
  year: number;
  value: number;
}

interface Track {
  id: string;
  name: string;
  nameHe: string;
  principal: number;
  rate: number;
  months: number;
  hasPenalty: boolean;
}

type MortgageMode = 'shorten' | 'reduce';

// ─── Shpitzer helpers ────────────────────────────────────────────────
function monthlyRate(annualPct: number): number {
  return annualPct / 100 / 12;
}

function shpitzerPayment(principal: number, annualPct: number, months: number): number {
  const r = monthlyRate(annualPct);
  if (r === 0) return principal / months;
  return (principal * (r * Math.pow(1 + r, months))) / (Math.pow(1 + r, months) - 1);
}

function amortize(principal: number, annualPct: number, months: number): ScheduleEntry[] {
  const r = monthlyRate(annualPct);
  const pmt = shpitzerPayment(principal, annualPct, months);
  let balance = principal;
  const schedule: ScheduleEntry[] = [];
  for (let m = 1; m <= months && balance > 0.01; m++) {
    const interest = balance * r;
    const principalPart = Math.min(pmt - interest, balance);
    balance -= principalPart;
    schedule.push({
      month: m,
      payment: pmt,
      interest,
      principal: principalPart,
      balance: Math.max(balance, 0),
    });
  }
  return schedule;
}

function amortizeAfterLump(
  origSchedule: ScheduleEntry[],
  lumpMonth: number,
  lumpAmount: number,
  mode: MortgageMode,
  annualPct: number
): ScheduleEntry[] {
  const pre = origSchedule.filter((s) => s.month <= lumpMonth);
  const atLump = origSchedule.find((s) => s.month === lumpMonth);
  if (!atLump) return origSchedule;
  const newBalance = Math.max(atLump.balance - lumpAmount, 0);
  if (newBalance <= 0) return [...pre.slice(0, -1), { ...atLump, balance: 0 }];
  const remainingMonths = origSchedule.length - lumpMonth;
  if (mode === 'reduce') {
    const newSchedule = amortize(newBalance, annualPct, remainingMonths);
    return [...pre, ...newSchedule.map((s) => ({ ...s, month: s.month + lumpMonth }))];
  } else {
    const origPayment = origSchedule[0].payment;
    const r = monthlyRate(annualPct);
    let balance = newBalance;
    const post: ScheduleEntry[] = [];
    let m = lumpMonth;
    while (balance > 0.01) {
      m++;
      const interest = balance * r;
      const principalPart = Math.min(origPayment - interest, balance);
      if (principalPart <= 0) break;
      balance -= principalPart;
      post.push({
        month: m,
        payment: Math.min(origPayment, interest + principalPart),
        interest,
        principal: principalPart,
        balance: Math.max(balance, 0),
      });
    }
    return [...pre, ...post];
  }
}

function calcPenalty(
  remainingBalance: number,
  loanRate: number,
  marketRate: number,
  remainingMonths: number
): number {
  if (marketRate >= loanRate) return 0;
  const r1 = monthlyRate(marketRate);
  const r2 = monthlyRate(loanRate);
  const pmt = shpitzerPayment(remainingBalance, loanRate, remainingMonths);
  let pv1 = 0,
    pv2 = 0;
  for (let m = 1; m <= remainingMonths; m++) {
    pv1 += pmt / Math.pow(1 + r1, m);
    pv2 += pmt / Math.pow(1 + r2, m);
  }
  return Math.max(pv1 - pv2, 0);
}

function investGrowth(amount: number, annualReturnPct: number, months: number): number {
  const r = annualReturnPct / 100 / 12;
  return amount * Math.pow(1 + r, months);
}

// ─── Formatters ──────────────────────────────────────────────────────
const fmt = (n: number): string => n.toLocaleString('he-IL', { maximumFractionDigits: 0 });
const fmtK = (n: number): string => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(0) + 'K' : fmt(n));

// ─── Constants ───────────────────────────────────────────────────────
const TRACKS: Track[] = [
  {
    id: 'fixed',
    name: 'Fixed Non-Linked',
    nameHe: 'קבועה לא צמודה',
    principal: 467500,
    rate: 4.55,
    months: 360,
    hasPenalty: true,
  },
  {
    id: 'prime',
    name: 'Prime Variable',
    nameHe: 'משתנה פריים',
    principal: 127500,
    rate: 4.5,
    months: 360,
    hasPenalty: false,
  },
  {
    id: 'variable2y',
    name: '2-Year Variable',
    nameHe: 'משתנה לא צמודה כל 2 שנים',
    principal: 255000,
    rate: 4.45,
    months: 360,
    hasPenalty: false,
  },
];

const TRACK_COLORS: Record<string, string> = {
  fixed: '#e07a5f',
  prime: '#3d85c6',
  variable2y: '#81b29a',
};

// ─── Custom Tooltip ──────────────────────────────────────────────────
interface CustomTooltipPayload {
  color?: string;
  name?: string;
  value?: number;
}

interface CustomTooltipInternalProps {
  active?: boolean;
  payload?: CustomTooltipPayload[];
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipInternalProps) {
  if (!active || !payload) return null;
  return (
    <div className="bg-card border-border rounded-lg border p-3 text-xs shadow-lg">
      <div className="text-muted-foreground mb-1">Year {label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-foreground font-mono">₪{fmt(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────
export default function MortgageSimulatorPage() {
  const [lumpSum, setLumpSum] = useState(200000);
  const [lumpMonth, setLumpMonth] = useState(24);
  const [targetTrack, setTargetTrack] = useState('fixed');
  const [mode, setMode] = useState<MortgageMode>('shorten');
  const [investReturn, setInvestReturn] = useState(8);
  const [capGainsTax, setCapGainsTax] = useState(25);
  const [marketRate, setMarketRate] = useState(4.0);
  const [activeTab, setActiveTab] = useState('overview');
  const [showHelp, setShowHelp] = useState(false);

  const track = TRACKS.find((t) => t.id === targetTrack) as Track;
  const afterTaxLabel = (investReturn * (1 - capGainsTax / 100)).toFixed(1);

  const results = useMemo(() => {
    const baseSchedules: Record<string, ScheduleEntry[]> = {};
    TRACKS.forEach((t) => {
      baseSchedules[t.id] = amortize(t.principal, t.rate, t.months);
    });

    const baseMonthly = TRACKS.reduce(
      (s, t) => s + shpitzerPayment(t.principal, t.rate, t.months),
      0
    );

    const targetTrackObj = TRACKS.find((t) => t.id === targetTrack) as Track;
    const effectiveLump = Math.min(
      lumpSum,
      baseSchedules[targetTrack][lumpMonth - 1]?.balance || 0
    );

    let penalty = 0;
    if (targetTrackObj.hasPenalty) {
      const remainBal = baseSchedules[targetTrack][lumpMonth - 1]?.balance || 0;
      const remainMonths = targetTrackObj.months - lumpMonth;
      penalty = calcPenalty(
        Math.min(effectiveLump, remainBal),
        targetTrackObj.rate,
        marketRate,
        remainMonths
      );
    }

    const totalLumpCost = effectiveLump + penalty;

    const newTargetSchedule = amortizeAfterLump(
      baseSchedules[targetTrack],
      lumpMonth,
      effectiveLump,
      mode,
      targetTrackObj.rate
    );

    const maxMonth = 360;
    const comparison: ComparisonEntry[] = [];
    let baseTotalInterest = 0,
      newTotalInterest = 0;
    let baseTotalPaid = 0,
      newTotalPaid = 0;

    for (let m = 1; m <= maxMonth; m++) {
      let basePayment = 0,
        baseInterest = 0;
      TRACKS.forEach((t) => {
        const entry = baseSchedules[t.id].find((e) => e.month === m);
        if (entry) {
          basePayment += entry.payment;
          baseInterest += entry.interest;
        }
      });

      let newPayment = 0,
        newInterest = 0;
      TRACKS.forEach((t) => {
        if (t.id === targetTrack) {
          const entry = newTargetSchedule.find((e) => e.month === m);
          if (entry) {
            newPayment += entry.payment;
            newInterest += entry.interest;
          }
        } else {
          const entry = baseSchedules[t.id].find((e) => e.month === m);
          if (entry) {
            newPayment += entry.payment;
            newInterest += entry.interest;
          }
        }
      });

      baseTotalInterest += baseInterest;
      newTotalInterest += newInterest;
      baseTotalPaid += basePayment;
      newTotalPaid += newPayment;

      const monthlySavings = m >= lumpMonth ? basePayment - newPayment : 0;

      comparison.push({
        month: m,
        year: (m / 12).toFixed(1),
        basePayment,
        newPayment,
        baseInterest,
        newInterest,
        monthlySavings,
        baseTotalInterest,
        newTotalInterest,
        baseTotalPaid,
        newTotalPaid,
      });
    }

    const totalMonths = 360;
    const monthsOfGrowth = totalMonths - lumpMonth;
    const afterTaxReturn = investReturn * (1 - capGainsTax / 100);
    const investmentValue = investGrowth(totalLumpCost, afterTaxReturn, monthsOfGrowth);
    const investmentGain = investmentValue - totalLumpCost;

    const interestSaved = baseTotalInterest - newTotalInterest;

    const newEndMonth =
      newTargetSchedule.length > 0 ? newTargetSchedule[newTargetSchedule.length - 1].month : 360;
    const baseEndMonth =
      baseSchedules[targetTrack].length > 0
        ? baseSchedules[targetTrack][baseSchedules[targetTrack].length - 1].month
        : 360;
    const monthsSaved = mode === 'shorten' ? baseEndMonth - newEndMonth : 0;

    const paymentReduction =
      mode === 'reduce'
        ? baseMonthly -
          (comparison.find((c) => c.month === lumpMonth + 1)?.newPayment || baseMonthly)
        : 0;

    let cumulativeInvestedSavings = 0;
    const savingsGrowth: SavingsGrowthEntry[] = [];
    const rMonthly = afterTaxReturn / 100 / 12;
    for (let m = lumpMonth; m <= 360; m++) {
      const entry = comparison.find((c) => c.month === m);
      const savings = entry?.monthlySavings || 0;
      cumulativeInvestedSavings = cumulativeInvestedSavings * (1 + rMonthly) + savings;
      if (m % 12 === 0 || m === 360) {
        savingsGrowth.push({ month: m, year: Math.ceil(m / 12), value: cumulativeInvestedSavings });
      }
    }

    const scenarioA_endValue = Math.round(investmentValue);
    const scenarioB_endValue = Math.round(cumulativeInvestedSavings);
    const payDownWins = scenarioB_endValue > scenarioA_endValue;

    const yearlyData: YearlyDataEntry[] = [];
    for (let y = 1; y <= 30; y++) {
      const m = y * 12;
      const entry = comparison.find((c) => c.month === m);
      const savEntry = savingsGrowth.find((s) => s.year === y);
      const investVal =
        m >= lumpMonth ? investGrowth(totalLumpCost, afterTaxReturn, m - lumpMonth) : totalLumpCost;
      if (entry) {
        yearlyData.push({
          year: y,
          basePayment: Math.round(entry.basePayment),
          newPayment: Math.round(entry.newPayment),
          baseCumInterest: Math.round(entry.baseTotalInterest),
          newCumInterest: Math.round(entry.newTotalInterest),
          interestSaved: Math.round(entry.baseTotalInterest - entry.newTotalInterest),
          investmentValue: Math.round(investVal),
          reinvestedSavings: Math.round(savEntry?.value || 0),
        });
      }
    }

    return {
      baseMonthly,
      effectiveLump,
      penalty,
      totalLumpCost,
      interestSaved,
      monthsSaved,
      paymentReduction,
      investmentValue: Math.round(investmentValue),
      investmentGain: Math.round(investmentGain),
      scenarioA_endValue,
      scenarioB_endValue,
      payDownWins,
      cumulativeReinvestedSavings: Math.round(cumulativeInvestedSavings),
      yearlyData,
      comparison,
      newEndMonth,
    };
  }, [lumpSum, lumpMonth, targetTrack, mode, investReturn, capGainsTax, marketRate]);

  const cardClass = 'bg-card border border-border rounded-lg p-5';
  const labelClass = 'text-muted-foreground text-xs uppercase tracking-wider mb-1 block';
  const inputClass =
    'w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground text-right font-mono focus:outline-none focus:border-[#a8caff] transition-colors';
  const cardHeaderClass = 'text-[#a8caff] text-xs uppercase tracking-widest font-medium mb-4';
  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
      active
        ? 'text-[#a8caff] border-b-2 border-[#a8caff]'
        : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-6">
      {/* Help Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-card border-border max-h-[80vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-lg border p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">About this simulator</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-muted-foreground text-sm">
              This dashboard answers:{' '}
              <em>
                &ldquo;Given a lump sum of cash, should I invest it in the market, or use it to pay
                down one of my mortgage tracks?&rdquo;
              </em>
            </p>

            <div className="space-y-4 text-sm">
              <section>
                <h3 className="mb-1 font-semibold text-[#a8caff]">The Two Scenarios</h3>
                <ul className="text-muted-foreground space-y-2">
                  <li>
                    <span className="font-medium text-[#fbbf24]">Scenario A — Invest:</span> You
                    invest the lump sum at the market return rate, and keep paying the full mortgage
                    as-is from rental income. The lump sum compounds for the remaining mortgage
                    term.
                  </li>
                  <li>
                    <span className="font-medium text-[#c9b8f7]">Scenario B — Pay down:</span> You
                    use the lump sum to reduce one mortgage track, then invest the monthly payment
                    savings (freed-up rent) into the market every month. Over time the freed-up
                    cashflow compounds.
                  </li>
                </ul>
                <p className="text-muted-foreground mt-2">
                  The winner is whoever has more money in their investment account at month 360.
                </p>
              </section>

              <section>
                <h3 className="mb-1 font-semibold text-[#a8caff]">After-Payment Modes</h3>
                <ul className="text-muted-foreground space-y-2">
                  <li>
                    <span className="text-foreground font-medium">Shorten Term:</span> Keep the same
                    monthly payment after paying down, finish the track earlier. Freed-up rent only
                    flows to investments once the track ends.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Reduce Payment:</span> Lower the
                    monthly payment immediately, keep the original 30-year term. Freed-up rent flows
                    to investments every month from the lump-sum month onward.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="mb-1 font-semibold text-[#a8caff]">Calculation Details</h3>
                <ul className="text-muted-foreground space-y-1.5">
                  <li>
                    <span className="text-foreground font-medium">Shpitzer (שפיצר):</span> Standard
                    French amortization — fixed payment, front-loaded interest. Formula: PMT = P ×
                    [r(1+r)ⁿ] / [(1+r)ⁿ − 1]
                  </li>
                  <li>
                    <span className="text-foreground font-medium">
                      Early Repayment Penalty (עמלת פירעון מוקדם):
                    </span>{' '}
                    Applies only to the fixed track. Calculated as the PV difference of remaining
                    payments at market rate vs. loan rate. Zero penalty if market rate ≥ loan rate.
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Investment growth:</span> Simple
                    compound growth using after-tax return — annual rate × (1 − capital gains tax
                    %).
                  </li>
                  <li>
                    <span className="text-foreground font-medium">Capital gains tax:</span> Applied
                    as a reduction to the annual return (not on realization events, for simplicity).
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="mb-1 font-semibold text-[#a8caff]">Assumptions</h3>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  <li>
                    • Interest rates are constant for 30 years (prime rate and 2-year variable
                    don&apos;t change)
                  </li>
                  <li>• Rental income roughly equals the mortgage payment (~₪4,500/mo)</li>
                  <li>• Investment returns are constant monthly compounding (no volatility)</li>
                  <li>• Prime and 2-year variable tracks have no early repayment penalty</li>
                  <li>• No inflation adjustment on any values</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title text-4xl font-bold tracking-tight">
            Mortgage <span className="text-[#a8caff]">Simulator</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ₪{fmt(850000)} · 30 years · FIBI Proposed Basket · Petach Tikva
          </p>
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className="text-muted-foreground mt-1 transition-colors hover:text-[#a8caff]"
          aria-label="How this works"
        >
          <HelpCircle className="h-6 w-6" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* ─── Inputs Panel ─── */}
        <div className="space-y-4 lg:col-span-1">
          <div className={cardClass}>
            <h2 className={cardHeaderClass}>Lump Sum Parameters</h2>

            <div className="space-y-4">
              <div>
                <label className={labelClass}>Amount (₪)</label>
                <input
                  type="number"
                  value={lumpSum}
                  onChange={(e) => setLumpSum(Math.max(0, +e.target.value))}
                  step={10000}
                  className={inputClass}
                />
                <input
                  type="range"
                  min={0}
                  max={850000}
                  step={10000}
                  value={lumpSum}
                  onChange={(e) => setLumpSum(+e.target.value)}
                  className="mt-2 w-full accent-[#a8caff]"
                />
              </div>

              <div>
                <label className={labelClass}>When (month)</label>
                <input
                  type="number"
                  value={lumpMonth}
                  onChange={(e) => setLumpMonth(Math.max(1, Math.min(360, +e.target.value)))}
                  className={inputClass}
                />
                <div className="text-muted-foreground mt-1 text-xs">
                  = year {(lumpMonth / 12).toFixed(1)}
                </div>
              </div>

              <div>
                <label className={labelClass}>Target Track</label>
                <div className="mt-1 space-y-1">
                  {TRACKS.map((t) => (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors ${
                        targetTrack === t.id
                          ? 'border-[#a8caff]/50 bg-[#a8caff]/5'
                          : 'hover:bg-secondary border-transparent'
                      }`}
                    >
                      <input
                        type="radio"
                        name="track"
                        checked={targetTrack === t.id}
                        onChange={() => setTargetTrack(t.id)}
                        className="accent-[#a8caff]"
                      />
                      <div>
                        <div className="text-foreground text-xs">{t.name}</div>
                        <div className="text-muted-foreground text-xs">
                          ₪{fmt(t.principal)} · {t.rate}%
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>After Payment</label>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setMode('shorten')}
                    className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-xs transition-all ${
                      mode === 'shorten'
                        ? 'border-[#a8caff] bg-[#a8caff]/10 text-[#a8caff]'
                        : 'border-border text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    Shorten Term
                  </button>
                  <button
                    onClick={() => setMode('reduce')}
                    className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-xs transition-all ${
                      mode === 'reduce'
                        ? 'border-[#a8caff] bg-[#a8caff]/10 text-[#a8caff]'
                        : 'border-border text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    Reduce Payment
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className={cardHeaderClass}>Investment &amp; Tax</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Annual Return (%)</label>
                <input
                  type="number"
                  value={investReturn}
                  onChange={(e) => setInvestReturn(+e.target.value)}
                  step={0.5}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Capital Gains Tax (%)</label>
                <input
                  type="number"
                  value={capGainsTax}
                  onChange={(e) => setCapGainsTax(+e.target.value)}
                  step={1}
                  className={inputClass}
                />
              </div>
              {track?.hasPenalty && (
                <div>
                  <label className={labelClass}>Market Rate at Repayment (%)</label>
                  <input
                    type="number"
                    value={marketRate}
                    onChange={(e) => setMarketRate(+e.target.value)}
                    step={0.1}
                    className={inputClass}
                  />
                  <div className="text-muted-foreground mt-1 text-xs">
                    For early repayment penalty calc
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div className="space-y-6 lg:col-span-3">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={cardClass}>
              <div className={labelClass}>Interest Saved</div>
              <div className="font-mono text-xl text-[#8fddb0]">₪{fmt(results.interestSaved)}</div>
            </div>
            <div className={cardClass}>
              <div className={labelClass}>
                {mode === 'shorten' ? 'Months Saved' : 'Payment Reduction'}
              </div>
              <div className="font-mono text-xl text-[#a8caff]">
                {mode === 'shorten'
                  ? `${results.monthsSaved} mo (${(results.monthsSaved / 12).toFixed(1)} yr)`
                  : `₪${fmt(results.paymentReduction)}/mo`}
              </div>
            </div>
            <div className={cardClass}>
              <div className={labelClass}>Penalty (עמלת פירעון)</div>
              <div
                className={`font-mono text-xl ${results.penalty > 0 ? 'text-[#f5a5a5]' : 'text-muted-foreground'}`}
              >
                ₪{fmt(results.penalty)}
              </div>
            </div>
            <div className={cardClass}>
              <div className={labelClass}>Reinvested Rent Savings</div>
              <div className="font-mono text-xl text-[#c9b8f7]">
                ₪{fmt(results.cumulativeReinvestedSavings)}
              </div>
              <div className="text-muted-foreground text-xs">freed-up rent compounded</div>
            </div>
          </div>

          {/* Verdict */}
          <div
            className={`${cardClass} border-l-4 ${
              results.payDownWins ? 'border-l-[#8fddb0]' : 'border-l-[#a8caff]'
            }`}
          >
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              {results.payDownWins ? (
                <>
                  <Home className="h-4 w-4 text-[#8fddb0]" />
                  <span>Paying down the mortgage wins</span>
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 text-[#a8caff]" />
                  <span>Investing the money wins</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div
                className={`rounded-lg p-3 ${
                  results.payDownWins
                    ? 'bg-secondary'
                    : 'border border-[#a8caff]/30 bg-[#a8caff]/10'
                }`}
              >
                <div className="text-muted-foreground mb-1">
                  Scenario A: Invest the ₪{fmt(results.totalLumpCost)}
                </div>
                <div className="font-mono text-lg text-[#a8caff]">
                  ₪{fmt(results.scenarioA_endValue)}
                </div>
                <div className="text-muted-foreground mt-1">
                  Lump sum grows at {investReturn}% ({afterTaxLabel}% after tax) for{' '}
                  {360 - lumpMonth} months
                </div>
              </div>
              <div
                className={`rounded-lg p-3 ${
                  !results.payDownWins
                    ? 'bg-secondary'
                    : 'border border-[#8fddb0]/30 bg-[#8fddb0]/10'
                }`}
              >
                <div className="text-muted-foreground mb-1">Scenario B: Pay down mortgage</div>
                <div className="font-mono text-lg text-[#8fddb0]">
                  ₪{fmt(results.scenarioB_endValue)}
                </div>
                <div className="text-muted-foreground mt-1">
                  Freed-up rent reinvested monthly at same return rate
                </div>
              </div>
            </div>
            <div className="text-muted-foreground mt-3 text-xs">
              Delta: ₪{fmt(Math.abs(results.scenarioA_endValue - results.scenarioB_endValue))} ·
              Both values are what you&apos;d have in your investment account at month 360.
              {mode === 'shorten' &&
                results.monthsSaved > 0 &&
                ` Once the ${track.name} track ends at month ${results.newEndMonth}, its ~₪${fmt(shpitzerPayment(track.principal, track.rate, 360))}/mo payment becomes investable rent surplus.`}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-border flex gap-1 border-b">
            {(['overview', 'payments', 'interest', 'investment'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={tabClass(activeTab === tab)}
              >
                {tab === 'overview'
                  ? 'Overview'
                  : tab === 'payments'
                    ? 'Payments'
                    : tab === 'interest'
                      ? 'Interest'
                      : 'Invest vs Pay'}
              </button>
            ))}
          </div>

          {/* Charts */}
          {activeTab === 'overview' && (
            <div className={cardClass}>
              <h3 className="text-foreground mb-4 text-sm">
                Monthly Payment Over Time (All 3 Tracks Combined)
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={results.yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    label={{
                      value: 'Year',
                      fill: '#6b7280',
                      fontSize: 11,
                      position: 'bottom',
                    }}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => `₪${fmtK(v)}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="stepAfter"
                    dataKey="basePayment"
                    name="Base Payment"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="newPayment"
                    name="After Lump Sum"
                    stroke="#a8caff"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-muted-foreground mt-3 text-xs">
                The lump sum only pays down the{' '}
                <span className="text-foreground">{track.name}</span> track. The other two tracks
                continue for the full 30 years, which is why payments don&apos;t drop to zero.
                {mode === 'shorten' &&
                  results.monthsSaved > 0 &&
                  ` You'll see a step-down once the ${track.name} track ends at ~month ${results.newEndMonth} (year ${(results.newEndMonth / 12).toFixed(1)}).`}
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className={cardClass}>
              <h3 className="text-foreground mb-4 text-sm">Monthly Savings (Base − New)</h3>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={results.yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => `₪${fmtK(v)}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey={(d: YearlyDataEntry) => d.basePayment - d.newPayment}
                    name="Monthly Savings"
                    fill="#8fddb033"
                    stroke="#8fddb0"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === 'interest' && (
            <div className={cardClass}>
              <h3 className="text-foreground mb-4 text-sm">Cumulative Interest Paid</h3>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={results.yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => `₪${fmtK(v)}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="baseCumInterest"
                    name="Base Interest"
                    fill="hsl(var(--muted-foreground) / 0.2)"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="newCumInterest"
                    name="After Lump Sum"
                    fill="#a8caff33"
                    stroke="#a8caff"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === 'investment' && (
            <div className={cardClass}>
              <h3 className="text-foreground mb-4 text-sm">
                Scenario A (Invest Lump) vs Scenario B (Pay Down + Reinvest Freed Rent)
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={results.yearlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    label={{
                      value: 'Year',
                      fill: '#6b7280',
                      fontSize: 11,
                      position: 'bottom',
                    }}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => `₪${fmtK(v)}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="investmentValue"
                    name="A: Lump Sum Invested"
                    stroke="#a8caff"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="reinvestedSavings"
                    name="B: Reinvested Rent Savings"
                    stroke="#c9b8f7"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <ReferenceLine
                    y={results.totalLumpCost}
                    stroke="#f5a5a566"
                    strokeDasharray="5 5"
                    label={{
                      value: `Lump ₪${fmtK(results.totalLumpCost)}`,
                      fill: '#f5a5a5',
                      fontSize: 10,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-muted-foreground mt-3 text-xs">
                Scenario A: ₪{fmt(results.totalLumpCost)} invested at {investReturn}% (
                {afterTaxLabel}% after tax). Scenario B: monthly payment savings reinvested at same
                rate.
                {mode === 'shorten' &&
                  results.monthsSaved > 0 &&
                  ` Track ends at month ${results.newEndMonth} — full ~₪${fmt(shpitzerPayment(track.principal, track.rate, 360))}/mo flows into investments from there.`}
              </div>
            </div>
          )}

          {/* Track Details */}
          <div className={cardClass}>
            <h3 className="text-foreground mb-4 text-sm">Mortgage Tracks (סל מוצע)</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {TRACKS.map((t) => {
                const pmt = shpitzerPayment(t.principal, t.rate, t.months);
                const totalPaid = pmt * t.months;
                const totalInterest = totalPaid - t.principal;
                return (
                  <div
                    key={t.id}
                    className={`rounded-lg border p-4 ${
                      targetTrack === t.id ? 'border-[#a8caff]/50 bg-[#a8caff]/5' : 'border-border'
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ background: TRACK_COLORS[t.id] }}
                      />
                      <span className="text-foreground text-xs font-medium">{t.name}</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Principal</span>
                        <span className="font-mono">₪{fmt(t.principal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rate</span>
                        <span className="font-mono">{t.rate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Monthly</span>
                        <span className="font-mono">₪{fmt(pmt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Interest</span>
                        <span className="font-mono text-[#f5a5a5]">₪{fmt(totalInterest)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Penalty Risk</span>
                        <span className={t.hasPenalty ? 'text-[#f5a5a5]' : 'text-[#8fddb0]'}>
                          {t.hasPenalty ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-border mt-3 flex justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Total Monthly Payment</span>
              <span className="font-mono text-[#a8caff]">₪{fmt(results.baseMonthly)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
