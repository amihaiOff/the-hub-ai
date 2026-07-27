import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { summarizeSource } from '@/lib/ai/wiki-summarize';
import { composeBody } from '@/lib/wiki/compose';

/**
 * Regenerate the summary + questions for an existing Source concept from
 * its stored `sourceRaw`. Preserves the concept's id / path so existing
 * links stay valid; replaces all questions (attempts survive via cascade
 * from the removed questions? — no, cascade drops them). We therefore
 * update questions in place: delete all + create fresh, inside a
 * transaction so nothing points at nothing mid-way.
 */
export const maxDuration = 120;

const inputSchema = z.object({
  promptOverride: z.string().max(4000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;
    const body = await request.json().catch(() => ({}));
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }

    const concept = await prisma.wikiConcept.findFirst({
      where: { id, householdId },
      include: {
        project: { select: { title: true, description: true, body: true } },
      },
    });
    if (!concept) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (!concept.sourceRaw) {
      return NextResponse.json(
        { success: false, error: 'Concept has no stored source text to re-summarize.' },
        { status: 400 }
      );
    }

    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { anthropicApiKey: true, wikiPrompt: true },
    });
    const apiKey = household?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'No Anthropic API key configured.' },
        { status: 400 }
      );
    }

    const result = await summarizeSource({
      apiKey,
      systemPrompt: parsed.data.promptOverride || household?.wikiPrompt || null,
      sourceText: concept.sourceRaw,
      sourceUrl: concept.sourceUrl,
      project: concept.project ?? null,
    });

    const composedBody = composeBody({
      summaryMarkdown: result.summaryMarkdown,
      projectRelevanceMarkdown: result.projectRelevanceMarkdown,
    });
    const now = new Date();

    // Replace body + questions atomically. Old attempts cascade away with
    // their questions — this is documented in v1; we keep it simple.
    await prisma.$transaction([
      prisma.wikiQuestion.deleteMany({ where: { conceptId: id } }),
      prisma.wikiConcept.update({
        where: { id },
        data: {
          title: result.title || concept.title,
          description: result.description || concept.description,
          body: composedBody,
          frontmatter: {
            ...(typeof concept.frontmatter === 'object' && concept.frontmatter
              ? (concept.frontmatter as Record<string, unknown>)
              : {}),
            title: result.title || concept.title,
            description: result.description,
            tags: result.tags,
            generated: {
              by: 'wiki_summarizer/claude-sonnet-4-6',
              at: now.toISOString(),
            },
          },
          generatedBy: 'wiki_summarizer/claude-sonnet-4-6',
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
      }),
    ]);

    return NextResponse.json({ success: true, data: { id, usage: result.usage } });
  } catch (error) {
    console.error('Wiki re-summarize failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to re-summarize',
      },
      { status: 500 }
    );
  }
}
