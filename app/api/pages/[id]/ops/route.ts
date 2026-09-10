import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { resolvePagesAccess } from '@/lib/auth-pages';
import { prisma } from '@/lib/db';
import { applyOps } from '@/lib/pages/page-ops';
import { describeOpsError, pageOpsRequestSchema } from '@/lib/validations/page-ops';
import { pageContentSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/pages/[id]/ops
 *
 * The structured way to write into a page. A caller sends a short list of
 * instructions ("add a paragraph", "add these rows", "set these cells") and the
 * server builds the document. Nothing else can: the plain content endpoints take
 * whatever document they're given, which is fine for the editor (it owns the
 * shape) and unsafe for anything else — a malformed document saves happily and
 * then fails to render, which breaks that page in the app.
 *
 * Concurrency: the editor autosaves the whole document while someone is typing.
 * A caller passes the tab's last-modified stamp as it last read it, and the
 * write only lands if the tab still carries that stamp — enforced in the update
 * itself, not by a check beforehand, so a save that slips in between can't be
 * silently overwritten. A refused write comes back as 409 with the current
 * stamp so the caller can re-read and retry. Requiring the stamp also makes a
 * retry safe: re-sending a write that already succeeded is refused rather than
 * appending the same rows twice.
 *
 * This protects one direction only. The editor's own autosave (the tab PATCH)
 * carries no such guard, so a browser left open on the page with a stale
 * document can still overwrite what was written here on its next keystroke.
 * Giving the editor the same check would change how every page saves, so it's
 * deliberately out of scope; a caller that cares re-reads on its next pass and
 * repairs anything lost.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const access = await resolvePagesAccess(request);
    if (!access) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Body is not valid JSON' },
        { status: 400 }
      );
    }
    const parsed = pageOpsRequestSchema.safeParse(body);
    if (!parsed.success) {
      // Located errors, not a bare "Invalid input" — the caller is a program
      // correcting its own request from this message.
      return NextResponse.json(
        { success: false, error: describeOpsError(parsed.error) },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const page = await prisma.page.findFirst({
      where: { id, householdId: access.householdId },
      select: {
        id: true,
        tabs: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, content: true, updatedAt: true },
        },
      },
    });
    if (!page) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const tab = input.tabId ? page.tabs.find((t) => t.id === input.tabId) : page.tabs[0];
    if (!tab) {
      return NextResponse.json(
        { success: false, error: input.tabId ? 'Tab not found' : 'This page has no tabs' },
        { status: 404 }
      );
    }

    // Checked up front so an obviously stale caller is told before we build
    // anything. The real guarantee is the compare-and-swap on the write below;
    // this is only the early, cheap half of it.
    if (tab.updatedAt.getTime() !== new Date(input.ifUnchangedSince).getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: 'The page changed since you read it',
          data: { tabId: tab.id, updatedAt: tab.updatedAt },
        },
        { status: 409 }
      );
    }

    const applied = applyOps(tab.content, input.ops);
    if (!applied.ok) {
      return NextResponse.json(
        { success: false, error: applied.error, data: { opIndex: applied.opIndex ?? null } },
        { status: 400 }
      );
    }

    // The size cap that guards the plain content endpoints applies here too — a
    // long enough run of valid instructions could still bloat the row.
    const sized = pageContentSchema.safeParse(applied.doc);
    if (!sized.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(sized.error) },
        { status: 400 }
      );
    }

    // Compare-and-swap: the stamp we read is part of the WHERE, so a save that
    // landed between our read and this write loses instead of being clobbered.
    // (Stamps are millisecond-resolution, so an autosave landing in the very
    // same millisecond as our read would still match. Closing that would need a
    // version counter; it isn't worth a column for a once-in-a-blue-moon tie.)
    const { count } = await prisma.pageTab.updateMany({
      where: { id: tab.id, updatedAt: tab.updatedAt },
      data: { content: applied.doc as unknown as Prisma.InputJsonValue },
    });
    if (count === 0) {
      const current = await prisma.pageTab.findUnique({
        where: { id: tab.id },
        select: { updatedAt: true },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'The page changed while this write was being applied',
          data: { tabId: tab.id, updatedAt: current?.updatedAt ?? null },
        },
        { status: 409 }
      );
    }

    const saved = await prisma.pageTab.findUnique({
      where: { id: tab.id },
      select: { updatedAt: true },
    });
    return NextResponse.json({
      success: true,
      data: { tabId: tab.id, updatedAt: saved?.updatedAt ?? null, outcomes: applied.outcomes },
    });
  } catch (error) {
    // Logged deliberately: this route has more branches that can throw than its
    // siblings, and an unlogged 500 from an unattended caller is undiagnosable.
    console.error('Failed to write to page:', error);
    return NextResponse.json({ success: false, error: 'Failed to write to page' }, { status: 500 });
  }
}
