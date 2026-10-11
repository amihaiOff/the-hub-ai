'use client';

import type { ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrencyILS } from '@/lib/utils/budget';
import { computeCost, REPORT_AGENT_PER_MTOK } from '@/lib/ai/pricing';
import type { BudgetReportDetail } from '@/lib/hooks/use-budget';
import type { CategoryStat } from '@/lib/budget-report/compute';
import { MAX_RUNS } from '@/lib/budget-report/shared';

const ils = (n: number) => formatCurrencyILS(n);
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
/** "10–16 Sep", or "28 Sep–4 Oct" across a month boundary. */
const weekLabel = (a: string, b: string) =>
  a.slice(0, 7) === b.slice(0, 7)
    ? `${Number(a.slice(8))}–${shortDate(b)}`
    : `${shortDate(a)}–${shortDate(b)}`;
const pct = (now: number, before: number) =>
  before > 0
    ? `${now >= before ? '+' : '−'}${Math.round((Math.abs(now - before) / before) * 100)}%`
    : '';

/** Payee names are often Hebrew: let each run of text pick its own direction. */
function Bidi({ children }: { children: ReactNode }) {
  return <span style={{ unicodeBidi: 'plaintext' }}>{children}</span>;
}

function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-lg font-medium">{title}</CardTitle>
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const TONE_BORDER = {
  watch: 'border-s-destructive',
  positive: 'border-s-green-500',
  info: 'border-s-primary',
} as const;

function Finding({
  tone,
  title,
  figure,
  body,
}: {
  tone: keyof typeof TONE_BORDER;
  title: string;
  figure: string;
  body: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 border-s-[3px] ps-4', TONE_BORDER[tone])}>
      <h3 className="font-medium">
        <Bidi>{title}</Bidi>
      </h3>
      <p className="text-muted-foreground text-sm tabular-nums">
        <Bidi>{figure}</Bidi>
      </p>
      <p className="text-sm leading-relaxed">
        <Bidi>{body}</Bidi>
      </p>
    </div>
  );
}

function Spark({ history }: { history: number[] }) {
  const max = Math.max(...history, 1);
  return (
    <svg width="64" height="22" viewBox="0 0 64 22" aria-hidden className="block">
      {history.map((v, i) => {
        const h = v > 0 ? Math.max((v / max) * 20, 1.5) : 0;
        return (
          <rect
            key={i}
            x={i * 16 + 1}
            y={21 - h}
            width={12}
            height={h}
            rx={2}
            className={i === history.length - 1 ? 'fill-primary' : 'fill-muted-foreground/40'}
          />
        );
      })}
    </svg>
  );
}

const STATUS: Record<CategoryStat['status'], { label: (c: CategoryStat) => string; cls: string }> =
  {
    over: { label: (c) => `${pct100(c)}%`, cls: 'text-destructive' },
    near: { label: (c) => `${pct100(c)}%`, cls: 'text-amber-500' },
    under: { label: (c) => `${pct100(c)}%`, cls: 'text-green-500' },
    none: { label: () => 'none yet', cls: 'text-muted-foreground' },
    no_budget: { label: () => 'no budget', cls: 'text-muted-foreground' },
  };
function pct100(c: CategoryStat) {
  return Math.round(((c.monthly - c.reimbursed) / (c.budget || 1)) * 100);
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="gap-1 py-5">
      <CardContent className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs tracking-wider uppercase">{label}</span>
        <span className={cn('text-2xl font-medium tabular-nums', tone)}>{value}</span>
        <span className="text-muted-foreground text-xs">{sub}</span>
      </CardContent>
    </Card>
  );
}

export function ReportView({ data }: { data: BudgetReportDetail }) {
  const { stats: s, report: r } = data;
  const cost = data.usage ? computeCost(data.usage, REPORT_AGENT_PER_MTOK).totalUsd : 0;
  const findings = r ? [...r.cards].sort((a, b) => ORDER[a.tone] - ORDER[b.tone]) : [];
  const weekMax = Math.max(...s.weeks.map((w) => w.flexible + w.oneOffs), 1);
  const likelyDups = s.duplicates.filter((d) => d.excludedId);
  const groups = [...new Set(s.categories.map((c) => c.group))];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <p className="text-muted-foreground text-sm">
        Cycle {shortDate(s.cycleStart)} – {shortDate(s.cycleEnd)}, compared with the 3 cycles before
        it.
      </p>

      {data.status === 'generating' && (
        <div className="bg-muted flex items-start gap-3 rounded-2xl p-4 text-sm" data-pdf-hide>
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <p>
            Writing the insights (part {Math.max(data.runCount, 1)} of up to {MAX_RUNS}). The
            numbers below are ready; the written report usually follows within a few minutes.
          </p>
        </div>
      )}
      {data.reportError && (
        <div className="bg-muted flex items-start gap-3 rounded-2xl p-4 text-sm">
          <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          <p>Only the numbers are shown: {data.reportError} Use Regenerate to try again.</p>
        </div>
      )}

      {r && (
        <div className="flex flex-col gap-2">
          <p className="text-xl font-medium text-balance">
            <Bidi>{r.headline}</Bidi>
          </p>
          <p className="text-muted-foreground max-w-prose leading-relaxed">
            <Bidi>{r.summary}</Bidi>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Everyday spending"
          value={ils(s.everyday)}
          sub={
            <>
              {pct(s.everyday, s.everydayAvg3)} vs {ils(s.everydayAvg3)} avg · budget{' '}
              {ils(s.budgetTotal)}
            </>
          }
        />
        <Tile
          label="Income"
          value={ils(s.income)}
          sub={<>vs {ils(s.totals[2].income)} last cycle</>}
        />
        <Tile
          label="Cash flow"
          value={ils(s.cashFlow)}
          tone={s.cashFlow < 0 ? 'text-destructive' : 'text-green-500'}
          sub="All income minus all spending (savings excluded)"
        />
        <Tile
          label={s.oneOffs.length ? 'One-offs' : 'Savings'}
          value={ils(s.oneOffs.length ? s.oneOffs.reduce((a, o) => a + o.total, 0) : s.savings)}
          sub={
            s.oneOffs.length ? (
              <Bidi>{s.oneOffs.map((o) => o.tag).join(', ')}</Bidi>
            ) : (
              'Transferred to savings this cycle'
            )
          }
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Everyday spending leaves out one-offs (tagged, uncategorised spending such as a trip),
        savings, likely duplicates, spending paid back by insurance
        {s.excludedCategories.length ? <>, and {s.excludedCategories.join(', ')}</> : null}.
      </p>

      <Section
        title="Week by week"
        note="Flexible spending (categories not marked “must”) plus one-offs."
      >
        <div className="flex flex-col gap-2.5">
          {s.weeks.map((w) => (
            <div
              key={w.start}
              className="grid grid-cols-[96px_1fr_72px] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">{weekLabel(w.start, w.end)}</span>
              <div className="bg-muted flex h-3 overflow-hidden rounded-full">
                <i
                  className="bg-primary block"
                  style={{ width: `${(w.flexible / weekMax) * 100}%` }}
                />
                <i
                  className="bg-chart-3 block"
                  style={{ width: `${(w.oneOffs / weekMax) * 100}%` }}
                />
              </div>
              <span className="text-end tabular-nums">{ils(w.flexible + w.oneOffs)}</span>
            </div>
          ))}
        </div>
      </Section>

      {findings.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {findings.map((f, i) => (
            <Card key={i} className="py-5">
              <CardContent>
                <Finding {...f} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(r?.duplicates.length || s.duplicates.length) > 0 && (
        <Section
          title="Possible duplicate transactions"
          note={
            likelyDups.length
              ? `The app left ${likelyDups.length} likely duplicate${likelyDups.length > 1 ? 's' : ''} (${ils(
                  likelyDups.reduce((a, d) => a + d.amount, 0)
                )}) out of the totals. Delete the pending copy in Transactions.`
              : undefined
          }
        >
          {r?.duplicates.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {r.duplicates.map((d, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <Bidi>{d.description}</Bidi>
                  <span className="shrink-0 tabular-nums">
                    {ils(d.amount)} · {d.confidence}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {s.duplicates.map((d) => (
                <li key={d.first.id} className="flex justify-between gap-4">
                  <span className="min-w-0">
                    <Bidi>{d.second.payee}</Bidi> · {shortDate(d.first.date)} &{' '}
                    {shortDate(d.second.date)}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {ils(d.amount)} · {d.confidence}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {(s.refunds.length > 0 || s.installments.length > 0 || s.oneOffs.length > 0) && (
        <Section title="Paid back, one-off and coming up">
          <ul className="flex flex-col gap-2 text-sm">
            {s.refunds.map((x, i) => (
              <li key={`r${i}`} className="flex justify-between gap-4">
                <span className="min-w-0">
                  {x.kind === 'insurance' ? 'Paid back by insurance' : 'Cancelled'}:{' '}
                  <Bidi>{x.expensePayee ?? x.refundPayee}</Bidi>
                  {x.expenseCategory ? ` (${x.expenseCategory})` : ''} →{' '}
                  <Bidi>{x.refundPayee}</Bidi> {shortDate(x.refundDate)}
                </span>
                <span className="shrink-0 text-green-500 tabular-nums">{ils(x.amount)}</span>
              </li>
            ))}
            {s.oneOffs.map((o) => (
              <li key={o.tag} className="flex justify-between gap-4">
                <span>
                  One-off: <Bidi>{o.tag}</Bidi> ({o.count} transactions)
                </span>
                <span className="shrink-0 tabular-nums">{ils(o.total)}</span>
              </li>
            ))}
            {s.installments.map((x, i) => (
              <li key={`i${i}`} className="flex justify-between gap-4">
                <span className="min-w-0">
                  Next cycle: <Bidi>{x.payee}</Bidi> installment {x.paymentNumber + 1} of{' '}
                  {x.totalPayments}
                </span>
                <span className="shrink-0 tabular-nums">{ils(x.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r?.deepDives.map((d, i) => (
        <Section key={i} title={d.title} note={<Bidi>{d.body}</Bidi>}>
          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm">
            {d.bullets.map((b, j) => (
              <li key={j}>
                <Bidi>{b}</Bidi>
              </li>
            ))}
          </ul>
        </Section>
      ))}

      {s.notSeen.length > 0 && (
        <Section
          title="Not seen this cycle"
          note="Usually there every month. They may be late (after the cycle closed) or may have stopped."
        >
          <ul className="flex flex-col gap-2 text-sm">
            {s.notSeen.map((n) => (
              <li key={`${n.kind}${n.name}`} className="flex justify-between gap-4">
                <span className="min-w-0">
                  <Bidi>{n.name}</Bidi>
                  {n.lastDate && (
                    <span className="text-muted-foreground"> · last {shortDate(n.lastDate)}</span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  avg {ils(n.avg3)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="Every category against its budget"
        note="Bars show the last 4 cycles. “~/mo” categories are billed every other month and judged on their average."
      >
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs tracking-wide uppercase">
                <th className="px-2 py-2 text-start font-normal">Category</th>
                <th className="px-2 py-2 text-start font-normal">Trend</th>
                <th className="px-2 py-2 text-end font-normal">This cycle</th>
                <th className="px-2 py-2 text-end font-normal">3-cycle avg</th>
                <th className="px-2 py-2 text-end font-normal">Budget</th>
                <th className="px-2 py-2 text-end font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => [
                <tr key={`g-${g}`}>
                  <td
                    colSpan={6}
                    className="text-muted-foreground px-2 pt-4 pb-1 text-xs tracking-wide uppercase"
                  >
                    <Bidi>{g}</Bidi>
                  </td>
                </tr>,
                ...s.categories
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-2 py-2">
                        <Bidi>{c.name}</Bidi>
                        {c.everyMonths > 1 && <span className="text-muted-foreground"> ~/mo</span>}
                      </td>
                      <td className="px-2 py-2">
                        <Spark history={c.history} />
                      </td>
                      <td className="px-2 py-2 text-end tabular-nums">
                        {ils(c.everyMonths > 1 ? c.monthly : c.actual)}
                      </td>
                      <td className="text-muted-foreground px-2 py-2 text-end tabular-nums">
                        {ils(c.avg3)}
                      </td>
                      <td className="text-muted-foreground px-2 py-2 text-end tabular-nums">
                        {c.budget ? ils(c.budget) : '—'}
                      </td>
                      <td className={cn('px-2 py-2 text-end text-xs', STATUS[c.status].cls)}>
                        {c.reimbursed > 0 && c.status === 'none'
                          ? 'reimbursed'
                          : STATUS[c.status].label(c)}
                      </td>
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
      </Section>

      {r && r.budgetFit.length > 0 && (
        <Section title="Budgets that don't match reality">
          <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm">
            {r.budgetFit.map((b, i) => (
              <li key={i}>
                <Bidi>{b}</Bidi>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {r && r.statsCorrections.length > 0 && (
        <Section title="Where the agent disagreed with the app's numbers">
          <ul className="flex flex-col gap-3 text-sm">
            {r.statsCorrections.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.figure}</span>: app {c.appValue}, agent{' '}
                {c.agentValue}.{' '}
                <span className="text-muted-foreground">
                  <Bidi>{c.explanation}</Bidi>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="text-muted-foreground flex flex-col gap-1 text-xs">
        {r?.method && (
          <p>
            <Bidi>{r.method}</Bidi>
          </p>
        )}
        <p>
          A cycle runs {shortDate(s.cycleStart)} – {shortDate(s.cycleEnd)} for every payment method.
          {data.model && ' Written by Claude'}
          {cost > 0 && ` · AI cost $${cost.toFixed(2)}`}.
        </p>
      </div>
    </div>
  );
}

const ORDER = { watch: 0, positive: 1, info: 2 } as const;
