import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getHouseholdIdFromAgentKey } from '@/lib/auth-api-key';
import { extractBacklog } from '@/lib/agent/backlog';

/**
 * GET /api/agent/backlog
 *
 * The Claude Code agent's read-only view of the "Claude backlog": rows of any
 * Areas-page database block whose "for Claude" column is checked. Authenticated
 * with a bearer token (`Authorization: Bearer <token>`) — the dedicated,
 * read-only `AGENT_READ_TOKEN` (safe to hand to an agent) or the full-access
 * `API_SECRET` — NOT the cookie session, so it works from a headless agent.
 * Returns each flagged row as a task with its other columns and the owning
 * page's text as context.
 */
export async function GET(request: NextRequest) {
  const householdId = await getHouseholdIdFromAgentKey(request);
  if (!householdId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Content lives on the page's tabs (`PageTab.content`), not `Page.content`
  // (that column is a frozen snapshot from the tabs migration). Read every tab
  // so rows added after the migration are included.
  const pages = await prisma.page.findMany({
    where: { householdId },
    select: {
      id: true,
      title: true,
      tabs: { select: { content: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const tasks = extractBacklog(
    pages.map((p) => ({ id: p.id, title: p.title, contents: p.tabs.map((t) => t.content) }))
  );
  return NextResponse.json({ success: true, data: { tasks, count: tasks.length } });
}
