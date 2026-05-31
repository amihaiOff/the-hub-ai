import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { MoneytorApiError } from '@/lib/api/moneytor';
import { syncMoneytorForHousehold } from '@/lib/api/moneytor-sync';

/**
 * POST /api/moneytor/sync
 * Manual sync — pulls transactions + stock holdings from Moneytor for the
 * active household. The same sync runs automatically once a day from the
 * daily-tasks cron for every household.
 */
export async function POST() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const summary = await syncMoneytorForHousehold(context.activeHousehold.id);

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    if (err instanceof MoneytorApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          code: err.code,
          renewUrl: err.renewUrl,
        },
        { status: err.status ?? 400 }
      );
    }
    console.error('Moneytor sync failed:', err);
    return NextResponse.json(
      {
        ok: false,
        error: 'Sync failed unexpectedly. Check server logs.',
        code: 'unknown',
      },
      { status: 500 }
    );
  }
}
