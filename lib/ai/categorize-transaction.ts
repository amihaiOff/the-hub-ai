import Anthropic from '@anthropic-ai/sdk';

/**
 * AI auto-categorization of a single budget transaction.
 *
 * Uses Claude Haiku (the cheapest tier — this is a classification task) with the
 * web-search server tool so it can look up unfamiliar merchant names, and a
 * strict `submit_result` tool so the decision comes back as validated JSON.
 * The model returns `categoryId: "none"` when nothing fits; the caller applies
 * its own confidence threshold on top of that.
 */

// Haiku 4.5 supports only the basic web-search tool variant (the dynamic-filter
// `_20260209` variant requires Opus/Sonnet-tier models).
const MODEL = 'claude-haiku-4-5';
const MAX_WEB_SEARCHES = 3;
const MAX_STEPS = 5;
// Cap a single categorization so one slow/hung request can't eat the whole
// serverless budget. The automatic drain retries on a later run.
const REQUEST_TIMEOUT_MS = 30_000;
// We do our own bounded, cross-run retry (see categorizationErrorCount), so keep
// the SDK's per-call retries low — retrying hard on a 429 only worsens it.
const SDK_MAX_RETRIES = 1;

export interface CategoryOption {
  id: string;
  name: string;
  group: string;
}

export interface CategorizeInput {
  /** Payee name or description shown to the user. */
  name: string;
  amountIls: number;
  notes?: string | null;
  categories: CategoryOption[];
}

export interface CategorizeResult {
  /** Chosen category id, or null when the model found no fitting category. */
  categoryId: string | null;
  /** Model's self-reported confidence, 0..1. */
  confidence: number;
  reasoning: string;
}

export function buildSystemPrompt(categories: CategoryOption[]): string {
  const list = categories.map((c) => `- ${c.id}: ${c.name} (group: ${c.group})`).join('\n');
  return `You categorize a household bank or credit-card transaction into exactly one of the user's budget categories.

Use the web_search tool to look up unfamiliar merchant, payee, or business names before deciding — many are Israeli businesses whose category isn't obvious from the name alone.

Choose a category ONLY if you are genuinely confident it fits. If none of the categories is a good fit, choose "none" rather than forcing a poor match. Be honest in the confidence score.

When you have decided, call submit_result exactly once. Do not call it more than once.

Available categories:
${list}`;
}

export async function categorizeTransaction(
  apiKey: string,
  input: CategorizeInput
): Promise<CategorizeResult> {
  const client = new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: SDK_MAX_RETRIES,
  });
  const validIds = new Set(input.categories.map((c) => c.id));

  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: MAX_WEB_SEARCHES },
    {
      name: 'submit_result',
      description: 'Report the chosen budget category for the transaction. Call exactly once.',
      input_schema: {
        type: 'object',
        properties: {
          categoryId: {
            type: 'string',
            enum: [...input.categories.map((c) => c.id), 'none'],
            description: 'The chosen category id, or "none" if no category is a good fit.',
          },
          confidence: {
            type: 'number',
            description:
              'Confidence from 0 (pure guess) to 1 (certain) that this category is correct.',
          },
          reasoning: { type: 'string', description: 'One short sentence explaining the choice.' },
        },
        required: ['categoryId', 'confidence', 'reasoning'],
        additionalProperties: false,
      },
    },
  ] as unknown as Anthropic.Messages.MessageCreateParams['tools'];

  const userText = [
    `Transaction: "${input.name}"`,
    `Amount: ₪${input.amountIls.toFixed(2)}`,
    input.notes ? `Notes: ${input.notes}` : null,
    'Which budget category does this belong to?',
  ]
    .filter(Boolean)
    .join('\n');

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userText }];
  const system = buildSystemPrompt(input.categories);

  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });

    const submit = resp.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'submit_result'
    );
    if (submit) {
      const raw = submit.input as { categoryId?: string; confidence?: number; reasoning?: string };
      const categoryId =
        raw.categoryId && raw.categoryId !== 'none' && validIds.has(raw.categoryId)
          ? raw.categoryId
          : null;
      const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
      return { categoryId, confidence, reasoning: String(raw.reasoning ?? '') };
    }

    // The web-search tool runs server-side within the turn; the only reason to
    // continue is a paused turn (server hit its internal step limit). Echo the
    // assistant content back verbatim to resume. Anything else → give up.
    if (resp.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: resp.content });
      continue;
    }
    break;
  }

  return { categoryId: null, confidence: 0, reasoning: 'Model did not return a decision.' };
}
