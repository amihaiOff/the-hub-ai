import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/share/[token]
 * The public, no-session read for a shared page. Selects ONLY the fields a
 * viewer is meant to see — never householdId/ownerId/sectionId, so nothing
 * about the owning household leaks through a shared link. A missing,
 * disabled, or never-existed token all return the identical 404 — a prober
 * can't tell "wrong token" from "sharing was turned off" from "no such page."
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const page = await prisma.page.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      title: true,
      emoji: true,
      autoCapitalize: true,
      shareAccess: true,
      tabs: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, content: true, sortOrder: true },
      },
    },
  });
  if (!page) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: page });
}
