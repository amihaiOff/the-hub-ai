/**
 * Bank of Israel Prime rate feed.
 *
 * The rate changes 3–6 times a year (Monetary Committee decisions). Prime is
 * historically Bank of Israel base rate + 1.5%. Two ways to feed the value:
 *
 * 1. `BOI_PRIME_RATE_OVERRIDE` env var (as a percentage, e.g. "5.5") —
 *    operator override; instant, no LLM call.
 * 2. `scrapeBoiPrimeViaLlm(apiKey)` — asks Haiku to look up the current rate
 *    via its web-search tool and cite the source URL. Used by the monthly
 *    cron. Costs a couple of cents per call and works even when the BoI
 *    site is a JS-rendered SPA (which plain fetch can't parse).
 *
 * Every fetch — env override, LLM call, or failure — writes one row to
 * market_rate_fetch_logs with the URL the LLM cited (when available), the
 * extracted rate, and whether it triggered a new market_rates insert.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';

export interface PrimeRateReading {
  rate: number; // fraction, e.g. 0.06 for 6%
  effectiveFrom: Date;
  /** URL the reading came from — null for env-var overrides. */
  sourceUrl: string | null;
  /** Free-text diagnostic (LLM reasoning, override note). */
  notes: string | null;
}

/**
 * Env-var override. When set, returns instantly with no source URL. Kept as
 * a manual escape hatch — no LLM call, no log entry (caller can still log).
 */
export function readBoiPrimeOverride(): PrimeRateReading | null {
  const override = process.env.BOI_PRIME_RATE_OVERRIDE;
  if (!override) return null;
  const parsed = parseFloat(override);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed >= 25) return null;
  return {
    rate: parsed / 100,
    effectiveFrom: new Date(),
    sourceUrl: null,
    notes: `env override BOI_PRIME_RATE_OVERRIDE=${override}`,
  };
}

const LLM_MODEL = 'claude-haiku-4-5';
const LLM_TIMEOUT_MS = 55_000;
const LLM_MAX_TOKENS = 800;
const LLM_MAX_WEB_SEARCHES = 4;

/**
 * Ask Haiku to look up the current Israeli Prime rate on the open web via
 * the web_search server tool and hand it back via a forced submit tool.
 * Returns the extracted rate as a fraction plus the URL the model cited.
 * Throws on model failure or an unusable extraction.
 */
export async function scrapeBoiPrimeViaLlm(apiKey: string): Promise<PrimeRateReading> {
  const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS, maxRetries: 1 });

  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: LLM_MAX_WEB_SEARCHES },
    {
      name: 'submit',
      description:
        'Report the current Israeli Prime interest rate. Call exactly once with the extracted rate and the source URL the value was read from.',
      input_schema: {
        type: 'object',
        properties: {
          prime_percent: {
            type: 'number',
            description:
              'The current Israeli Prime interest rate as an annual percentage (e.g. 6.0 for 6%). NOT the Bank of Israel base rate — Prime = base rate + 1.5%.',
          },
          source_url: {
            type: 'string',
            description: 'The URL where the value was read from.',
          },
          notes: {
            type: 'string',
            description:
              'One short sentence: source, date of the reading, and how you derived Prime (e.g. from the BoI base rate + 1.5).',
          },
        },
        required: ['prime_percent', 'source_url', 'notes'],
        additionalProperties: false,
      },
    },
  ] as unknown as Anthropic.Messages.MessageCreateParams['tools'];

  const system = `You look up the current Israeli Prime lending rate ("ריבית הפריים") from an authoritative public source and return it via the submit tool.

Preferred sources, in order:
1. Bank of Israel (boi.org.il) — read the current base rate, then Prime = base + 1.5%.
2. A major Israeli bank publishing its Prime directly (Bank Hapoalim, Bank Leumi, Bank Discount, FIBI/הבינלאומי, Mizrahi Tefahot).
3. A reputable Israeli financial news outlet (Globes, TheMarker, Calcalist).

Call web_search as needed to find the current value. Do NOT invent — if you cannot find a fresh (this year) authoritative value after searching, still submit with your best-supported guess and explicitly say "uncertain — best guess" in notes.

Call submit exactly once when you have the value.`;

  const resp = await client.messages.create({
    model: LLM_MODEL,
    max_tokens: LLM_MAX_TOKENS,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools,
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content:
          'Look up the current Israeli Prime lending rate. Return the value as a percentage.',
      },
    ],
  });

  const submit = resp.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit'
  );
  if (!submit) {
    throw new Error('LLM did not call submit — no rate extracted.');
  }
  const raw = submit.input as { prime_percent?: number; source_url?: string; notes?: string };
  const primePercent = Number(raw.prime_percent);
  if (!Number.isFinite(primePercent) || primePercent <= 0 || primePercent >= 25) {
    throw new Error(`LLM returned an implausible rate: ${raw.prime_percent}`);
  }
  return {
    rate: primePercent / 100,
    effectiveFrom: new Date(),
    sourceUrl: typeof raw.source_url === 'string' ? raw.source_url : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
  };
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
 * Log a fetch attempt to market_rate_fetch_logs. Never throws — logging
 * failure must not break the cron.
 */
export async function logBoiPrimeFetch(args: {
  reading: PrimeRateReading | null;
  outcome: { inserted: boolean; rate: number | null; previousRate: number | null };
  error?: string;
}): Promise<void> {
  try {
    await prisma.marketRateFetchLog.create({
      data: {
        name: 'BOI_PRIME',
        sourceUrl: args.reading?.sourceUrl ?? null,
        rate: args.outcome.rate ?? args.reading?.rate ?? null,
        previousRate: args.outcome.previousRate,
        inserted: args.outcome.inserted,
        error: args.error ?? null,
        notes: args.reading?.notes ?? null,
      },
    });
  } catch (err) {
    console.error('Failed to write market_rate_fetch_log:', err);
  }
}

/**
 * Fetch full Prime history (ascending by effective date) so callers can pass
 * it to `simulateTrack` for PRIME_LINKED tracks.
 */
export async function loadBoiPrimeHistory(): Promise<Array<{ rate: number; effectiveFrom: Date }>> {
  const rows = await prisma.marketRate.findMany({
    where: { name: 'BOI_PRIME' },
    orderBy: { effectiveFrom: 'asc' },
  });
  return rows.map((r) => ({ rate: r.rate.toNumber(), effectiveFrom: r.effectiveFrom }));
}

/**
 * Legacy shim retained for callers that expect a `null`-on-no-update
 * signature. New code should call `readBoiPrimeOverride()` +
 * `scrapeBoiPrimeViaLlm()` explicitly.
 */
export async function fetchBoiPrime(): Promise<PrimeRateReading | null> {
  return readBoiPrimeOverride();
}
