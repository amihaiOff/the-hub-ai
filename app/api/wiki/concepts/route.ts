import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { projectPathFor, slugify } from '@/lib/wiki/compose';

/**
 * GET /api/wiki/concepts    — list every concept in the active household.
 * POST /api/wiki/concepts   — create a manual concept (typically a Project).
 * The LLM Source ingest lives at /api/wiki/sources.
 */

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const rows = await prisma.wikiConcept.findMany({
    where: { householdId: context.activeHousehold.id },
    select: {
      id: true,
      path: true,
      type: true,
      title: true,
      description: true,
      projectId: true,
      sourceUrl: true,
      generatedAt: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
  return NextResponse.json({ success: true, data: rows });
}

const createSchema = z.object({
  type: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  body: z.string().default(''),
  tags: z.array(z.string().max(60)).max(20).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;
    const householdId = context.activeHousehold.id;
    const now = new Date();

    // Path pick: projects/<slug> for Project, else <type-slug>/<slug>.
    const basePath =
      input.type === 'Project'
        ? projectPathFor(input.title)
        : `${slugify(input.type)}/${slugify(input.title)}`;
    let attempt = 0;
    while (true) {
      const path = attempt === 0 ? basePath : `${basePath}-${attempt + 1}`;
      try {
        const concept = await prisma.wikiConcept.create({
          data: {
            householdId,
            path,
            type: input.type,
            title: input.title,
            description: input.description ?? null,
            body: input.body,
            frontmatter: {
              type: input.type,
              title: input.title,
              description: input.description,
              tags: input.tags ?? [],
              generated: {
                by: `human:${context.user.email}`,
                at: now.toISOString(),
              },
            },
            generatedBy: `human:${context.user.email}`,
            generatedAt: now,
          },
        });
        return NextResponse.json({ success: true, data: concept });
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any)?.code === 'P2002' && attempt < 20) {
          attempt++;
          continue;
        }
        throw err;
      }
    }
  } catch (error) {
    console.error('Wiki concept create failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create concept' },
      { status: 500 }
    );
  }
}
