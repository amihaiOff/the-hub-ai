import Anthropic from '@anthropic-ai/sdk';

/**
 * LLM ingest pipeline for the Wiki module.
 *
 * Given a source's raw text (extracted upstream from URL / PDF / paste) and
 * optional project context, calls Anthropic once with a forced tool schema
 * and returns a structured `SummarizeResult`. The consumer stores the
 * result as a WikiConcept row + five WikiQuestion rows.
 *
 * Model choice: Haiku 4.5. Sonnet 4.6 gave nicer prose but consistently
 * exceeded Vercel Hobby's 60s function ceiling on longer pastes, which
 * surfaces as a raw platform-level 500 (the try/catch never gets a chance
 * to return our JSON error). Haiku on the same input finishes in 15–25s
 * and, because the tool schema forces the structure, the "deep-
 * understanding" question quality is close enough. Flip back to Sonnet
 * when we're on a plan with a >60s function budget.
 */

const MODEL = 'claude-haiku-4-5';
// Wall-clock time is dominated by output generation, not input processing —
// Haiku digests prompt tokens at ~30k tok/s, so a 500k-char article
// (~120k tokens) adds only ~4s while a 2048-token output takes ~25s. The
// tight lever is `max_tokens`; input length just costs money (Haiku input
// = $1/M tokens) and doesn't push us past Vercel's 60s ceiling.
const MAX_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 55_000;

/**
 * Default household prompt used when no override is stored. Emphasises OKF
 * structural markdown, deep-understanding questions (not trivia), and the
 * project-relevance side-section behaviour.
 */
export const DEFAULT_WIKI_PROMPT = `You produce an OKF-compliant knowledge summary from a source text.

# Output shape
Call the submit tool exactly once with:
- title, description, tags — for the concept's frontmatter.
- summary_markdown — a structured markdown summary organised under ## subheadings, favouring bullet lists, tables, and short paragraphs over long prose. Cover the source's central claims, key definitions, and any non-obvious mechanics; skip fluff and marketing framing.
- project_relevance_markdown — ONLY when a project context is supplied. Explain, in specific terms tied to the project's stated goals, how the source's ideas apply. Do NOT restate the summary; write only the "so what for this project" side.
- questions — exactly FIVE multiple-choice questions that test deep understanding. Not memorization: each question should force the reader to reason about implications, tradeoffs, or applications of the source's ideas. Four plausible options each (a-d), one correct, and a one-to-two-sentence explanation that cites the reasoning, not just the answer.

# Style
Direct, technical, terse. Assume a smart reader. If the source contradicts itself or leaves gaps, name them.`;

export interface QuestionShape {
  question: string;
  options: [string, string, string, string];
  correctIdx: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface SummarizeResult {
  title: string;
  description: string;
  tags: string[];
  summaryMarkdown: string;
  projectRelevanceMarkdown: string | null;
  questions: QuestionShape[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
}

export interface SummarizeInput {
  apiKey: string;
  /** Household system prompt override; falls back to DEFAULT_WIKI_PROMPT. */
  systemPrompt?: string | null;
  /** Extracted plaintext of the source (URL body, PDF text, or user paste). */
  sourceText: string;
  /** Optional URL for the user-visible attribution chip. */
  sourceUrl?: string | null;
  /** Optional project context: pass the project concept's title + body. */
  project?: { title: string; description: string | null; body: string } | null;
}

export async function summarizeSource(input: SummarizeInput): Promise<SummarizeResult> {
  const client = new Anthropic({
    apiKey: input.apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });

  const userText = [
    input.sourceUrl ? `Source URL: ${input.sourceUrl}` : null,
    input.project
      ? `\nProject context — "${input.project.title}"${
          input.project.description ? `: ${input.project.description}` : ''
        }\n\n${input.project.body}\n`
      : null,
    '\n--- SOURCE TEXT ---\n',
    input.sourceText,
  ]
    .filter(Boolean)
    .join('\n');

  const tools = [
    {
      name: 'submit',
      description: 'Return the structured OKF summary and 5 comprehension questions.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          summary_markdown: { type: 'string' },
          project_relevance_markdown: { type: ['string', 'null'] },
          questions: {
            type: 'array',
            minItems: 5,
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                options: {
                  type: 'array',
                  minItems: 4,
                  maxItems: 4,
                  items: { type: 'string' },
                },
                correct_index: { type: 'integer', minimum: 0, maximum: 3 },
                explanation: { type: 'string' },
              },
              required: ['question', 'options', 'correct_index', 'explanation'],
              additionalProperties: false,
            },
          },
        },
        required: [
          'title',
          'description',
          'tags',
          'summary_markdown',
          'project_relevance_markdown',
          'questions',
        ],
        additionalProperties: false,
      },
    },
  ] as unknown as Anthropic.Messages.MessageCreateParams['tools'];

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: input.systemPrompt || DEFAULT_WIKI_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools,
    tool_choice: { type: 'tool', name: 'submit' },
    messages: [{ role: 'user', content: userText }],
  });

  const submit = resp.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use' && b.name === 'submit'
  );
  if (!submit) {
    throw new Error('Model did not call submit tool');
  }
  const raw = submit.input as {
    title: string;
    description: string;
    tags: string[];
    summary_markdown: string;
    project_relevance_markdown: string | null;
    questions: Array<{
      question: string;
      options: string[];
      correct_index: number;
      explanation: string;
    }>;
  };

  const questions: QuestionShape[] = raw.questions.map((q) => ({
    question: q.question,
    options: [q.options[0], q.options[1], q.options[2], q.options[3]],
    correctIdx: Math.max(0, Math.min(3, Math.round(q.correct_index))) as 0 | 1 | 2 | 3,
    explanation: q.explanation,
  }));

  return {
    title: raw.title,
    description: raw.description,
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 12) : [],
    summaryMarkdown: raw.summary_markdown,
    projectRelevanceMarkdown: raw.project_relevance_markdown || null,
    questions,
    usage: {
      inputTokens: resp.usage.input_tokens ?? 0,
      outputTokens: resp.usage.output_tokens ?? 0,
      cacheCreationTokens: resp.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: resp.usage.cache_read_input_tokens ?? 0,
    },
  };
}
