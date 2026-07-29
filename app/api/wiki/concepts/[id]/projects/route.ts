import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';

/** POST /api/wiki/concepts/[id]/projects — file this source under a project. */

const bodySchema = z.object({ projectId: z.string().cuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const { projectId } = parsed.data;

    // Both ends must be in the caller's household; the source can't be a
    // project and the target must be a Project.
    const [source, project] = await Promise.all([
      prisma.wikiConcept.findFirst({
        where: { id, householdId },
        select: { id: true, type: true },
      }),
      prisma.wikiConcept.findFirst({
        where: { id: projectId, householdId, type: 'Project' },
        select: { id: true },
      }),
    ]);
    if (!source) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (source.type === 'Project') {
      return NextResponse.json(
        { success: false, error: 'A project cannot be filed under a project' },
        { status: 400 }
      );
    }
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 400 });
    }

    // Idempotent: adding an existing membership is a no-op. We deliberately do
    // NOT touch the source's relevance `projectId` here — that's the single
    // project the body's relevance section was written for at ingest, and it's
    // orthogonal to membership. (DELETE clears it only if it matched the removed
    // project.) Adding a source to a project is organizational; it does not
    // regenerate a per-project relevance section.
    await prisma.wikiConceptProject.upsert({
      where: { sourceId_projectId: { sourceId: id, projectId } },
      create: { sourceId: id, projectId },
      update: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wiki add-to-project failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add to project' },
      { status: 500 }
    );
  }
}
