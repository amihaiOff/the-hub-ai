import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { UsageCounts } from '@/lib/ai/pricing';

/**
 * The monthly budget-report agent.
 *
 * Claude Opus gets the raw transactions in an Anthropic-hosted code-execution
 * sandbox (plus web search for unfamiliar payees) and decides for itself which
 * checks to run; the app's baseline numbers are one of its input files. It
 * finishes by calling `submit_report`.
 *
 * A Vercel function lives at most 300s, so `runReportAgent` works turn by turn
 * and stops before starting a turn past `turnCutoffAt`. The conversation so far
 * (`AgentState`, appended to unchanged) is returned so the next run can resume
 * it in the same sandbox container.
 */

export const REPORT_MODEL = 'claude-opus-5-5';
const MAX_WEB_SEARCHES = 5;
const MAX_NUDGES = 2;
// Don't start a model call with less than this left before the hard deadline.
const MIN_CALL_MS = 20_000;

const cardSchema = z.object({
  tone: z.enum(['watch', 'positive', 'info']),
  title: z.string(),
  figure: z.string(),
  body: z.string(),
});

export const reportContentSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  cards: z.array(cardSchema),
  deepDives: z.array(
    z.object({ title: z.string(), body: z.string(), bullets: z.array(z.string()) })
  ),
  duplicates: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
      confidence: z.enum(['likely', 'possible']),
    })
  ),
  budgetFit: z.array(z.string()),
  statsCorrections: z.array(
    z.object({
      figure: z.string(),
      appValue: z.string(),
      agentValue: z.string(),
      explanation: z.string(),
    })
  ),
  method: z.string(),
});
export type ReportContent = z.infer<typeof reportContentSchema>;

const str = (description: string) => ({ type: 'string', description });
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SUBMIT_TOOL = {
  name: 'submit_report',
  description:
    'Submit the finished monthly report. Call exactly once, when your analysis is done (or when told time is up).',
  strict: true,
  input_schema: obj({
    headline: str('One sentence: the main story of the month.'),
    summary: str('A short paragraph summarising the month for the household.'),
    cards: {
      type: 'array',
      description:
        'Findings. tone "watch" = needs attention (spending up, over budget, habit change); "positive" = good change; "info" = neutral but worth knowing.',
      items: obj({
        tone: { type: 'string', enum: ['watch', 'positive', 'info'] },
        title: str('Short headline of the finding.'),
        figure: str('The key numbers, e.g. "₪3,412 vs ₪3,135 avg · budget ₪1,000".'),
        body: str('2-4 sentences: what happened, why it matters, how you checked.'),
      }),
    },
    deepDives: {
      type: 'array',
      description:
        'Longer looks at anything that deserves one (catch-all categories, payee trends, anything else you found).',
      items: obj({
        title: str('Section title.'),
        body: str('Short intro paragraph.'),
        bullets: { type: 'array', items: { type: 'string' } },
      }),
    },
    duplicates: {
      type: 'array',
      description: 'Possible duplicate transactions you believe are real duplicates.',
      items: obj({
        description: str('Payee, dates and why you think it is a duplicate.'),
        amount: { type: 'number' },
        confidence: { type: 'string', enum: ['likely', 'possible'] },
      }),
    },
    budgetFit: {
      type: 'array',
      description:
        'Budgets that do not match how the household actually spends, with a suggestion.',
      items: { type: 'string' },
    },
    statsCorrections: {
      type: 'array',
      description: 'Where you disagree with a number in stats.json. Empty if none.',
      items: obj({
        figure: str('Which number.'),
        appValue: str("The app's value."),
        agentValue: str('Your value.'),
        explanation: str('Why.'),
      }),
    },
    method: str('One or two sentences on what you checked and how.'),
  }),
};

export interface AgentState {
  messages: Anthropic.MessageParam[];
  containerId: string | null;
  fileIds: string[];
}

export interface AgentRunResult {
  status: 'done' | 'paused' | 'failed';
  state: AgentState;
  usage: UsageCounts;
  report?: ReportContent;
  error?: string;
}

export const emptyUsage = (): UsageCounts => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  webSearches: 0,
});

export function addUsage(into: UsageCounts, u: UsageCounts): UsageCounts {
  return {
    inputTokens: into.inputTokens + u.inputTokens,
    outputTokens: into.outputTokens + u.outputTokens,
    cacheCreationTokens: into.cacheCreationTokens + u.cacheCreationTokens,
    cacheReadTokens: into.cacheReadTokens + u.cacheReadTokens,
    webSearches: into.webSearches + u.webSearches,
  };
}

export function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 1 });
}

/** Upload the data files and build the opening message. */
export async function startAgentState(
  client: Anthropic,
  intro: string,
  files: { name: string; content: string; type: string }[]
): Promise<AgentState> {
  const fileIds: string[] = [];
  for (const f of files) {
    const uploaded = await client.beta.files.upload({
      file: await toFile(Buffer.from(f.content, 'utf8'), f.name, { type: f.type }),
    });
    fileIds.push(uploaded.id);
  }
  return {
    containerId: null,
    fileIds,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: intro },
          ...fileIds.map((id) => ({ type: 'container_upload' as const, file_id: id })),
        ],
      },
    ],
  };
}

/** Best-effort cleanup of the uploaded data files once a report is finished. */
export async function deleteAgentFiles(client: Anthropic, state: AgentState | null) {
  for (const id of state?.fileIds ?? []) {
    await client.beta.files.delete(id).catch(() => undefined);
  }
}

export async function runReportAgent(opts: {
  client: Anthropic;
  system: string;
  state: AgentState;
  /** Don't start a new model turn after this (epoch ms). */
  turnCutoffAt: number;
  /** Hard stop for any in-flight call (epoch ms). */
  deadlineAt: number;
  /** Last allowed run: tell the agent to submit now. */
  finalRun: boolean;
  /**
   * Called after every completed turn with the conversation so far and this
   * run's usage, so progress survives the invocation being killed.
   */
  onTurn?: (state: AgentState, usage: UsageCounts) => Promise<void>;
}): Promise<AgentRunResult> {
  const { client, system } = opts;
  const messages = [...opts.state.messages];
  let containerId = opts.state.containerId;
  let usage = emptyUsage();
  const snapshot = (): AgentState => ({
    messages: [...messages],
    containerId,
    fileIds: opts.state.fileIds,
  });

  if (opts.finalRun) {
    messages.push({
      role: 'user',
      content: 'Time is up: call submit_report now with what you have.',
    });
  }

  let nudges = 0;
  let turns = 0;
  for (;;) {
    // Persist every completed turn (the conversation is valid to resend here).
    if (turns++ > 0) await opts.onTurn?.(snapshot(), usage);
    const remaining = opts.deadlineAt - Date.now();
    if (Date.now() > opts.turnCutoffAt || remaining < MIN_CALL_MS) {
      return { status: 'paused', state: snapshot(), usage };
    }

    let msg: Anthropic.Message;
    try {
      msg = await client.messages
        .stream(
          {
            model: REPORT_MODEL,
            max_tokens: 32_000,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
            cache_control: { type: 'ephemeral' },
            system,
            container: containerId,
            tools: [
              { type: 'code_execution_20260120', name: 'code_execution' },
              { type: 'web_search_20250305', name: 'web_search', max_uses: MAX_WEB_SEARCHES },
              SUBMIT_TOOL,
            ] as unknown as Anthropic.Messages.ToolUnion[],
            messages,
          },
          // An abort signal also covers the streamed body (the SDK's `timeout`
          // only covers waiting for headers). No retries: a retry would get the
          // full budget again and could outlive the function.
          { signal: AbortSignal.timeout(remaining), maxRetries: 0 }
        )
        .finalMessage();
    } catch (err) {
      // Ran out of time mid-turn: that turn is lost, everything before it is
      // kept and the next run picks up from there.
      if (
        err instanceof Anthropic.APIConnectionTimeoutError ||
        err instanceof Anthropic.APIUserAbortError ||
        (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
      ) {
        return { status: 'paused', state: snapshot(), usage };
      }
      return {
        status: 'failed',
        state: snapshot(),
        usage,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    usage = addUsage(usage, {
      inputTokens: msg.usage.input_tokens ?? 0,
      outputTokens: msg.usage.output_tokens ?? 0,
      cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
      webSearches: msg.usage.server_tool_use?.web_search_requests ?? 0,
    });
    containerId = msg.container?.id ?? containerId;
    messages.push({ role: 'assistant', content: msg.content });

    if (msg.stop_reason === 'refusal') {
      return {
        status: 'failed',
        state: snapshot(),
        usage,
        error: 'The model declined to write the report.',
      };
    }

    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const submit = toolUses.find((b) => b.name === 'submit_report');
    if (submit && msg.stop_reason !== 'max_tokens') {
      const parsed = reportContentSchema.safeParse(submit.input);
      if (parsed.success) return { status: 'done', state: snapshot(), usage, report: parsed.data };
    }
    if (toolUses.length > 0) {
      // submit_report is the only client-side tool; anything else (or an
      // invalid submission) gets an error result so the conversation stays valid.
      messages.push({
        role: 'user',
        content: toolUses.map((b) => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          is_error: true,
          content:
            b.name === 'submit_report'
              ? 'The report did not match the schema (or was cut off). Call submit_report again with a complete report.'
              : `Unknown tool ${b.name}.`,
        })),
      });
      if (++nudges > MAX_NUDGES) break;
      continue;
    }

    if (msg.stop_reason === 'pause_turn') continue;

    // Ended without submitting.
    if (++nudges > MAX_NUDGES) break;
    messages.push({
      role: 'user',
      content: 'Please call submit_report now with your finished report.',
    });
  }

  return {
    status: 'failed',
    state: snapshot(),
    usage,
    error: 'The agent never submitted a valid report.',
  };
}
