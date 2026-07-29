import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/** DELETE /api/wiki/concepts/[id]/projects/[projectId] — unfile a source. */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try {
    const { id, projectId } = await params;
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    // Scope the delete to a membership whose source is in the caller's
    // household — deleteMany so removing a non-existent membership is a no-op
    // rather than a 404 (idempotent), and the household filter prevents IDOR.
    const { count } = await prisma.wikiConceptProject.deleteMany({
      where: { sourceId: id, projectId, source: { householdId } },
    });

    // If it was the relevance project, clear the legacy pointer too so the
    // source doesn't keep claiming a project it's no longer filed under.
    if (count > 0) {
      await prisma.wikiConcept.updateMany({
        where: { id, householdId, projectId },
        data: { projectId: null },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wiki remove-from-project failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove from project' },
      { status: 500 }
    );
  }
}
