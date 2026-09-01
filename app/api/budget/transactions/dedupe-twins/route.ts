import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { dedupeMoneytorTwinsForHousehold } from '@/lib/utils/dedupe-moneytor-twins';

/**
 * POST /api/budget/transactions/dedupe-twins
 *
 * Manual trigger for the pending→settled twin merge. Idempotent — running
 * it against an already-cleaned household returns { merged: 0 }.
 */
export async function POST() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const householdId = context.activeHousehold.id;

  try {
    const summary = await dedupeMoneytorTwinsForHousehold(householdId);
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    console.error('dedupe-twins failed:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to dedupe transactions' },
      { status: 500 }
    );
  }
}
