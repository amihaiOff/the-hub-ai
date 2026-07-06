import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * POST /api/labs/general-log/mark-read
 * Marks all unread general-log entries for the active household as read.
 * Called when the user opens the Activity page.
 */
export async function POST() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await prisma.generalLog.updateMany({
    where: { householdId: context.activeHousehold.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true, data: { markedRead: result.count } });
}
