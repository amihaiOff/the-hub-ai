import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { monthToCycleRange } from '@/lib/utils/billing-cycle';
import type { UsageCounts } from '@/lib/ai/pricing';
import {
  computeReportStats,
  cycleOf,
  reportWindow,
  type ReportCategory,
  type ReportTx,
} from './compute';
import {
  REPORT_MODEL,
  addUsage,
  createClient,
  deleteAgentFiles,
  emptyUsage,
  runReportAgent,
  startAgentState,
  type AgentState,
} from './agent';
import { buildSystemPrompt } from './prompt';
import { MAX_RUNS } from './shared';

/**
 * Orchestrates one report: baseline stats first (saved immediately, so a
 * numbers-only report always exists), then the agent in up to MAX_RUNS
 * function invocations of ≤300s each. A run that doesn't finish saves the
 * agent's conversation and hands off to POST /api/budget/reports/continue.
 */

// Route maxDuration is 300s; stop starting turns well before, and give any
// in-flight call a hard stop that still leaves time to save.
const TURN_CUTOFF_MS = 180_000;
const RUN_DEADLINE_MS = 270_000;
// A run holds the report for this long; after it, another run may take over.
const LOCK_MS = 6 * 60_000;
// A "generating" report untouched this long lost its hand-off; resume it.
export const STUCK_MS = 15 * 60_000;

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n');

async function loadReportData(householdId: string, month: string) {
  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { billingCycleStartDay: true, anthropicApiKey: true, reportPrompt: true },
  });
  const startDay = household.billingCycleStartDay;
  const { from, to } = reportWindow(month, startDay);

  const [dbCategories, dbTx] = await Promise.all([
    prisma.budgetCategory.findMany({
      where: { householdId },
      include: { group: { select: { name: true, sortOrder: true } } },
      orderBy: [{ group: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    }),
    prisma.budgetTransaction.findMany({
      where: {
        householdId,
        transactionDate: { gte: new Date(from), lt: new Date(to) },
        isDeleted: false,
        isSplit: false,
        excludedFromFlow: false,
        OR: [{ payeeId: null }, { payee: { isBlacklisted: false } }],
      },
      select: {
        id: true,
        type: true,
        transactionDate: true,
        amountIls: true,
        currency: true,
        amountOriginal: true,
        categoryId: true,
        notes: true,
        paymentMethod: true,
        paymentNumber: true,
        totalPayments: true,
        moneytorId: true,
        payee: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
      orderBy: { transactionDate: 'asc' },
    }),
  ]);

  const categories: ReportCategory[] = dbCategories.map((c) => ({
    id: c.id,
    name: c.name,
    group: c.group.name,
    budget: c.budget == null ? null : Number(c.budget),
    isMust: c.isMust,
    excluded: c.reportExcluded,
    everyMonths: c.reportEveryMonths,
  }));
  const rows: ReportTx[] = dbTx.map((t) => ({
    id: t.id,
    type: t.type,
    date: t.transactionDate.toISOString().slice(0, 10),
    amount: Number(t.amountIls),
    currency: t.currency,
    amountOriginal: Number(t.amountOriginal),
    categoryId: t.categoryId,
    payee: t.payee?.name ?? null,
    notes: t.notes,
    tags: t.tags.map((x) => x.tag.name),
    paymentMethod: t.paymentMethod,
    paymentNumber: t.paymentNumber,
    totalPayments: t.totalPayments,
    settled: t.moneytorId != null,
  }));

  return {
    household,
    startDay,
    categories,
    rows,
    stats: computeReportStats(month, startDay, rows, categories),
  };
}

function buildFiles(data: Awaited<ReturnType<typeof loadReportData>>) {
  const catById = new Map(data.categories.map((c) => [c.id, c]));
  const transactions = toCsv([
    [
      'id',
      'cycle',
      'date',
      'type',
      'amount_ils',
      'currency',
      'amount_original',
      'category',
      'category_group',
      'payee',
      'notes',
      'tags',
      'payment_method',
      'payment_number',
      'total_payments',
      'settled',
    ],
    ...data.rows.map((t) => {
      const c = t.categoryId ? catById.get(t.categoryId) : undefined;
      return [
        t.id,
        cycleOf(t.date, data.startDay),
        t.date,
        t.type,
        t.amount,
        t.currency,
        t.amountOriginal,
        c?.name,
        c?.group,
        t.payee,
        t.notes,
        t.tags.join('|'),
        t.paymentMethod,
        t.paymentNumber,
        t.totalPayments,
        t.settled,
      ];
    }),
  ]);
  const categories = toCsv([
    ['name', 'group', 'budget', 'every_months', 'excluded', 'is_must'],
    ...data.categories.map((c) => [c.name, c.group, c.budget, c.everyMonths, c.excluded, c.isMust]),
  ]);
  return [
    { name: 'transactions.csv', content: transactions, type: 'text/csv' },
    { name: 'categories.csv', content: categories, type: 'text/csv' },
    { name: 'stats.json', content: JSON.stringify(data.stats, null, 1), type: 'application/json' },
  ];
}

/** Compute the baseline and (re)start the report row for `month`. */
export async function createReport(householdId: string, month: string) {
  const data = await loadReportData(householdId, month);
  const stats = data.stats as unknown as Prisma.InputJsonValue;
  const reset = {
    status: 'generating',
    stats,
    report: Prisma.DbNull,
    reportError: null,
    usage: Prisma.DbNull,
    agentState: Prisma.DbNull,
    runCount: 0,
    lastRunAt: null,
  };
  const existing = await prisma.budgetReport.findUnique({
    where: { householdId_month: { householdId, month } },
    select: { agentState: true },
  });
  // Regenerating: drop the previous run's uploaded files.
  const apiKey = resolveApiKey(data.household);
  if (existing?.agentState && apiKey) {
    await deleteAgentFiles(createClient(apiKey), existing.agentState as unknown as AgentState);
  }
  return prisma.budgetReport.upsert({
    where: { householdId_month: { householdId, month } },
    create: { householdId, month, ...reset },
    update: reset,
    select: { id: true, month: true, status: true },
  });
}

const resolveApiKey = (h: { anthropicApiKey: string | null }) =>
  h.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';

/**
 * Writes from a run only land while that run still holds the report
 * (`lastRunAt` = its claim time), so a run that lost the lock (e.g. the
 * report was regenerated meanwhile) can't overwrite the newer state.
 */
const heldBy = (id: string, claim: Date) => ({ id, lastRunAt: claim });

async function finish(
  id: string,
  claim: Date,
  data: { report?: unknown; reportError?: string | null; usage: UsageCounts }
) {
  await prisma.budgetReport.updateMany({
    where: heldBy(id, claim),
    data: {
      status: 'ready',
      report: data.report ? (data.report as Prisma.InputJsonValue) : Prisma.DbNull,
      reportError: data.reportError ?? null,
      usage: data.usage as unknown as Prisma.InputJsonValue,
      model: REPORT_MODEL,
      agentState: Prisma.DbNull,
      lastRunAt: null,
    },
  });
}

/**
 * One ≤300s step of the agent. Returns 'continue' when the next step should
 * be handed off, 'busy' when another run holds the report.
 */
export async function runReportStep(id: string): Promise<'done' | 'continue' | 'busy'> {
  const startedAt = Date.now();
  const claim = new Date(startedAt);
  const claimed = await prisma.budgetReport.updateMany({
    where: {
      id,
      status: 'generating',
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(startedAt - LOCK_MS) } }],
    },
    data: { lastRunAt: claim, runCount: { increment: 1 } },
  });
  if (claimed.count === 0) return 'busy';

  const row = await prisma.budgetReport.findUniqueOrThrow({ where: { id } });
  const prevUsage = (row.usage as unknown as UsageCounts | null) ?? emptyUsage();
  const household = await prisma.household.findUniqueOrThrow({
    where: { id: row.householdId },
    select: { anthropicApiKey: true, reportPrompt: true },
  });
  const apiKey = resolveApiKey(household);
  if (!apiKey) {
    await finish(id, claim, {
      usage: prevUsage,
      reportError: 'No Anthropic API key is set (Settings), so only the numbers are shown.',
    });
    return 'done';
  }

  const client = createClient(apiKey);
  let state = row.agentState as unknown as AgentState | null;

  // Hard cap. Normally the final run forces a submission, but a run that was
  // killed (and later resumed from the stuck-report path) never gets there —
  // without this, a report could be resumed and re-billed indefinitely.
  if (row.runCount > MAX_RUNS) {
    await deleteAgentFiles(client, state);
    await finish(id, claim, {
      usage: prevUsage,
      reportError: `The agent didn't finish within ${MAX_RUNS} runs.`,
    });
    return 'done';
  }

  // Usage up to the last saved turn, so a crash still records what was billed.
  let latestUsage = prevUsage;
  try {
    if (!state) {
      const data = await loadReportData(row.householdId, row.month);
      const { from, to } = monthToCycleRange(row.month, data.startDay);
      const last = new Date(to.getTime() - 86_400_000).toISOString().slice(0, 10);
      state = await startAgentState(
        client,
        `Write the monthly report for cycle ${row.month} (${from.toISOString().slice(0, 10)} to ${last}). ` +
          'The data files are attached in your code-execution sandbox.',
        buildFiles(data)
      );
    }

    const result = await runReportAgent({
      client,
      system: buildSystemPrompt(household.reportPrompt),
      state,
      turnCutoffAt: startedAt + TURN_CUTOFF_MS,
      deadlineAt: startedAt + RUN_DEADLINE_MS,
      finalRun: row.runCount >= MAX_RUNS,
      onTurn: async (turnState, runUsage) => {
        latestUsage = addUsage(prevUsage, runUsage);
        await prisma.budgetReport.updateMany({
          where: heldBy(id, claim),
          data: {
            agentState: turnState as unknown as Prisma.InputJsonValue,
            usage: latestUsage as unknown as Prisma.InputJsonValue,
          },
        });
      },
    });
    const usage = addUsage(prevUsage, result.usage);

    if (result.status === 'paused' && row.runCount < MAX_RUNS) {
      const saved = await prisma.budgetReport.updateMany({
        where: heldBy(id, claim),
        data: {
          agentState: result.state as unknown as Prisma.InputJsonValue,
          usage: usage as unknown as Prisma.InputJsonValue,
          lastRunAt: null,
        },
      });
      // Lost the lock (regenerated meanwhile): leave the new run alone.
      return saved.count > 0 ? 'continue' : 'done';
    }
    await deleteAgentFiles(client, result.state);
    await finish(id, claim, {
      usage,
      report: result.report,
      reportError:
        result.status === 'done'
          ? null
          : (result.error ?? `The agent didn't finish within ${MAX_RUNS} runs.`),
    });
    return 'done';
  } catch (err) {
    console.error('Budget report step failed:', err);
    await deleteAgentFiles(client, state);
    await finish(id, claim, {
      usage: latestUsage,
      reportError: `The report agent failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return 'done';
  }
}

function appBaseUrl(): string {
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3001}`;
}

/**
 * Start the next ≤300s run in a fresh invocation. The continue route answers
 * immediately and does its work after responding, so this only waits for the
 * acknowledgement. Retried with backoff; if it still fails, the report is
 * resumed the next time someone opens a Budget page (resumeStuckReports).
 */
export async function triggerContinue(id: string): Promise<boolean> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.CRON_SECRET) headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  // Preview deployments sit behind Vercel's deployment protection.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${appBaseUrl()}/api/budget/reports/continue`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return true;
    } catch {
      // retry below
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  console.error(
    `Budget report ${id}: hand-off failed; it will resume on the next Budget page visit.`
  );
  return false;
}

/** Run one step and hand off if there's more to do. */
export async function runAndHandOff(id: string) {
  if ((await runReportStep(id)) === 'continue') await triggerContinue(id);
}

/** Report ids stuck in "generating" (a lost hand-off) for this household. */
export async function findStuckReports(householdId: string): Promise<string[]> {
  const rows = await prisma.budgetReport.findMany({
    where: {
      householdId,
      status: 'generating',
      updatedAt: { lt: new Date(Date.now() - STUCK_MS) },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
