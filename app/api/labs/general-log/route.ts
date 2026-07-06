import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/labs/general-log
 * Returns the active household's general log (rename events, hard-deletes,
 * etc.), newest first, plus an unreadCount for the nav-badge dot.
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const householdId = context.activeHousehold.id;
  const [rows, unreadCount] = await Promise.all([
    prisma.generalLog.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.generalLog.count({ where: { householdId, readAt: null } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      unreadCount,
      entries: rows.map((r) => ({
        id: r.id,
        type: r.type,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        oldValue: r.oldValue,
        newValue: r.newValue,
        description: r.description,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    },
  });
}
