import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { summarizeSource } from '@/lib/ai/wiki-summarize';
import { fetchSource } from '@/lib/wiki/fetch-source';
import { composeBody, sourcePathFor } from '@/lib/wiki/compose';

/** LLM ingest: URL, paste, or extracted text → summarized Source concept + 5 questions. */
// Vercel Hobby caps functions at 60s regardless of `maxDuration`; setting it
// higher misleads without changing anything, so we pin to 60 and use Haiku
// (see lib/ai/wiki-summarize.ts) so the flow reliably finishes inside it.
export const maxDuration = 60;

const inputSchema = z
  .object({
    url: z.string().url().optional(),
    rawText: z.string().min(1).max(500_000).optional(),
    projectId: z.string().cuid().optional().nullable(),
    promptOverride: z.string().max(4000).optional(),
  })
  .refine((v) => !!(v.url || v.rawText), {
    message: 'Provide url or rawText',
  });

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    // Resolve API key + prompt from household settings.
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { anthropicApiKey: true, wikiPrompt: true },
    });
    const apiKey = household?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'No Anthropic API key configured. Add one in Settings.',
        },
        { status: 400 }
      );
    }

    // Resolve source text.
    let sourceText: string;
    let sourceUrl: string | null = null;
    let fetchedTitle: string | null = null;
    if (input.url) {
      const fetched = await fetchSource(input.url);
      sourceText = fetched.text;
      sourceUrl = fetched.url;
      fetchedTitle = fetched.title;
    } else {
      sourceText = input.rawText!;
    }

    // Resolve optional project context.
    let project: { title: string; description: string | null; body: string } | null = null;
    if (input.projectId) {
      const proj = await prisma.wikiConcept.findFirst({
        where: { id: input.projectId, householdId, type: 'Project' },
        select: { title: true, description: true, body: true },
      });
      if (proj) project = proj;
    }

    const result = await summarizeSource({
      apiKey,
      systemPrompt: input.promptOverride || household?.wikiPrompt || null,
      sourceText,
      sourceUrl,
      project,
    });

    // Compose the OKF body from the parts and persist.
    const composedBody = composeBody({
      summaryMarkdown: result.summaryMarkdown,
      projectRelevanceMarkdown: result.projectRelevanceMarkdown,
    });

    const now = new Date();
    const year = now.getUTCFullYear();
    const title = result.title || fetchedTitle || 'Untitled source';

    // Path uniqueness: retry with -2, -3 suffix on collision.
    let attempt = 0;
    let concept;
    while (true) {
      const path =
        attempt === 0 ? sourcePathFor(title, year) : `${sourcePathFor(title, year)}-${attempt + 1}`;
      try {
        concept = await prisma.wikiConcept.create({
          data: {
            householdId,
            path,
            type: 'Source',
            title,
            description: result.description || null,
            frontmatter: {
              type: 'Source',
              title,
              description: result.description,
              tags: result.tags,
              sources: sourceUrl
                ? [{ id: 'src', resource: sourceUrl, title: fetchedTitle || title }]
                : [],
              project: project ? { id: input.projectId } : undefined,
              generated: {
                by: 'wiki_summarizer/claude-haiku-4-5',
                at: now.toISOString(),
              },
            },
            body: composedBody,
            projectId: input.projectId ?? null,
            sourceUrl,
            sourceRaw: sourceText,
            generatedBy: 'wiki_summarizer/claude-haiku-4-5',
            generatedAt: now,
            questions: {
              create: result.questions.map((q, i) => ({
                orderIndex: i,
                question: q.question,
                options: q.options,
                correctIdx: q.correctIdx,
                explanation: q.explanation,
              })),
            },
          },
        });
        break;
      } catch (err) {
        // Prisma P2002 = unique constraint violation on (householdId, path).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any)?.code === 'P2002' && attempt < 20) {
          attempt++;
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json({
      success: true,
      data: { id: concept.id, path: concept.path, usage: result.usage },
    });
  } catch (error) {
    console.error('Wiki source ingest failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to ingest source',
      },
      { status: 500 }
    );
  }
}
