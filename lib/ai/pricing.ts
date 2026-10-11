/**
 * Pricing for the AI auto-categorization feature (Claude Haiku 4.5 + the
 * web-search server tool). Used to turn recorded token/search counts into a
 * USD cost for the Labs → AI Spend page.
 *
 * Rates are USD and reflect Anthropic's published Haiku 4.5 pricing. They are
 * intentionally centralised here so a price change is a one-line edit — verify
 * against https://www.anthropic.com/pricing when Anthropic updates them.
 */

// Per-million-token rates.
const PER_MTOK = {
  input: 1.0, // base input
  output: 5.0, // output
  cacheWrite5m: 1.25, // writing to the 5-minute prompt cache (1.25× input)
  cacheRead: 0.1, // reading from the prompt cache (0.1× input)
} as const;

// Claude Opus 5.5 — the monthly budget-report agent. Published rates (cache
// reads are $0.20/MTok for this model, not the 0.1× ratio used above).
export const REPORT_AGENT_PER_MTOK = {
  input: 4.0,
  output: 20.0,
  cacheWrite5m: 5.0,
  cacheRead: 0.2,
} as const;

// Web search server tool: $10 per 1,000 searches.
const PER_WEB_SEARCH = 10 / 1000;

const MTOK = 1_000_000;

export interface UsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  webSearches: number;
}

export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  cacheWriteUsd: number;
  cacheReadUsd: number;
  searchUsd: number;
  totalUsd: number;
}

/** Compute the USD cost of a set of usage counts, broken down by component. */
export function computeCost(
  u: UsageCounts,
  rates: { input: number; output: number; cacheWrite5m: number; cacheRead: number } = PER_MTOK
): CostBreakdown {
  const inputUsd = (u.inputTokens / MTOK) * rates.input;
  const outputUsd = (u.outputTokens / MTOK) * rates.output;
  const cacheWriteUsd = (u.cacheCreationTokens / MTOK) * rates.cacheWrite5m;
  const cacheReadUsd = (u.cacheReadTokens / MTOK) * rates.cacheRead;
  const searchUsd = u.webSearches * PER_WEB_SEARCH;
  return {
    inputUsd,
    outputUsd,
    cacheWriteUsd,
    cacheReadUsd,
    searchUsd,
    totalUsd: inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd + searchUsd,
  };
}

/** The rate table, exposed so the UI can show users the assumptions. */
export const AI_PRICING = { perMTok: PER_MTOK, perWebSearch: PER_WEB_SEARCH } as const;
