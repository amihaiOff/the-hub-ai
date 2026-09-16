import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { generateShareToken } from '@/lib/pages/share-token';
import { sharePageSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Sharing management — session-only, deliberately NOT reachable via the
 * scoped `AGENT_PAGES_TOKEN` (unlike GET/PATCH on the page itself). Turning
 * public access on/off or rotating its token is an owner-only action, so
 * this calls `getCurrentContext()` directly rather than `resolvePagesAccess`,
 * matching the existing DELETE routes.
 */

/**
 * GET /api/pages/[id]/share
 * The owner's own read of the current share state (used by the Share dialog
 * on open). Session-only — same reasoning as POST/DELETE below: the general
 * `GET /api/pages/[id]` deliberately omits `shareToken` from its response
 * (see that route) so a caller in via the scoped `AGENT_PAGES_TOKEN` can't
 * read a live link off it and use it on the fully public `/api/share/[token]`
 * — this route is the one sanctioned place the raw token is ever returned.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const page = await prisma.page.findFirst({
    where: { id, householdId: context.activeHousehold.id },
    select: { shareToken: true, shareAccess: true },
  });
  if (!page) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: page });
}

/**
 * POST /api/pages/[id]/share
 * Enables (or updates) public link-sharing. Generates a token on first
 * enable; a later call with the same page just updates `access` and keeps
 * the existing token, unless `regenerate: true` rotates it (invalidating
 * whatever link was already handed out).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const existing = await prisma.page.findFirst({
      where: { id, householdId: context.activeHousehold.id },
      select: { id: true, shareToken: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = sharePageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const { access, regenerate } = parsed.data;

    const shareToken =
      !existing.shareToken || regenerate ? generateShareToken() : existing.shareToken;

    const updated = await prisma.page.update({
      where: { id },
      data: { shareToken, shareAccess: access },
      select: { shareToken: true, shareAccess: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to update sharing' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pages/[id]/share
 * Turns sharing off. The old link stops working immediately — its token no
 * longer matches any row.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const existing = await prisma.page.findFirst({
      where: { id, householdId: context.activeHousehold.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    await prisma.page.update({
      where: { id },
      data: { shareToken: null, shareAccess: null },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to disable sharing' },
      { status: 500 }
    );
  }
}
