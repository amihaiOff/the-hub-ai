import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/labs/general-log/unread-count
 * Lightweight endpoint powering the nav badge dot on Labs. Returns the
 * count of unread general-log entries for the active household.
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const unreadCount = await prisma.generalLog.count({
    where: { householdId: context.activeHousehold.id, readAt: null },
  });

  return NextResponse.json({ success: true, data: { unreadCount } });
}
