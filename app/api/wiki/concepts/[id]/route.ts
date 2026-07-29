import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';

/** Single wiki concept — full read + editable fields + delete. */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const concept = await prisma.wikiConcept.findFirst({
    where: { id, householdId: context.activeHousehold.id },
    include: {
      project: { select: { id: true, title: true, path: true } },
      // All projects this source is filed under (many-to-many memberships).
      projectMemberships: {
        include: { project: { select: { id: true, title: true, path: true } } },
      },
      questions: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  });
  if (!concept) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  const { projectMemberships, ...rest } = concept;
  const projects = projectMemberships
    .map((m) => m.project)
    .sort((a, b) => a.title.localeCompare(b.title));
  // Include projectIds too so the payload satisfies WikiConceptDetail (which
  // extends the list row) and stays consistent with the list endpoint.
  return NextResponse.json({
    success: true,
    data: { ...rest, projects, projectIds: projectMemberships.map((m) => m.projectId) },
  });
}

// Note: `projectId` is intentionally NOT patchable here. Membership lives in
// wiki_concept_projects (see the /projects routes); letting PATCH set the
// scalar directly would desync grouping from the membership table.
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  body: z.string().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;
    const existing = await prisma.wikiConcept.findFirst({
      where: { id, householdId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const updated = await prisma.wikiConcept.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Wiki concept update failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update concept' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const existing = await prisma.wikiConcept.findFirst({
      where: { id, householdId: context.activeHousehold.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    await prisma.wikiConcept.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wiki concept delete failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete concept' },
      { status: 500 }
    );
  }
}
