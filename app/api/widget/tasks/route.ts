import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getHouseholdIdFromWidgetToken, resolveHouseholdOwnerUserId } from '@/lib/auth-api-key';

const TASKS_PER_CATEGORY = 10;

/**
 * GET /api/widget/tasks?token=<WIDGET_TOKEN>
 *
 * Read-only feed for an Android KWGT home-screen widget: the household owner's
 * open top-level tasks grouped by category, first 10 titles each, in the same
 * order as the Tasks page. Shaped flat so KWGT can address it by index, e.g.
 * `$wg(url, json, .categories[0].tasks[3])$`. Empty categories are omitted so
 * the widget's arrows never land on a blank page; uncategorised tasks come last.
 */
export async function GET(request: NextRequest) {
  const householdId = await getHouseholdIdFromWidgetToken(
    request.nextUrl.searchParams.get('token')
  );
  const userId = householdId && (await resolveHouseholdOwnerUserId(householdId));
  if (!householdId || !userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const [categories, tasks] = await Promise.all([
    prisma.taskCategory.findMany({
      where: { householdId },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.task.findMany({
      // Same visibility as the Tasks page: owned by OR shared with the owner.
      where: {
        householdId,
        done: false,
        parentTaskId: null,
        OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
      },
      select: { title: true, categoryId: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    }),
  ]);

  const groups = [...categories, { id: null, name: 'Uncategorized' }]
    .map(({ id, name }) => {
      const titles = tasks.filter((t) => t.categoryId === id).map((t) => t.title || 'Untitled');
      return { name, total: titles.length, tasks: titles.slice(0, TASKS_PER_CATEGORY) };
    })
    .filter((g) => g.total > 0);

  return NextResponse.json(
    { count: groups.length, categories: groups },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
