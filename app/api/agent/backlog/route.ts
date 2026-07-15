import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getHouseholdIdFromApiKey } from '@/lib/auth-api-key';
import { extractBacklog } from '@/lib/agent/backlog';

/**
 * GET /api/agent/backlog
 *
 * The Claude Code agent's read-only view of the "Claude backlog": rows of any
 * Areas-page database block whose "for Claude" column is checked. Authenticated
 * with the shared API key (`Authorization: Bearer <API_SECRET>`), NOT the
 * cookie session, so it works from a headless agent. Returns each flagged row
 * as a task with its other columns and the owning page's text as context.
 */
export async function GET(request: NextRequest) {
  const householdId = await getHouseholdIdFromApiKey(request);
  if (!householdId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const pages = await prisma.page.findMany({
    where: { householdId },
    select: { id: true, title: true, content: true },
    orderBy: { updatedAt: 'desc' },
  });

  const tasks = extractBacklog(pages);
  return NextResponse.json({ success: true, data: { tasks, count: tasks.length } });
}
