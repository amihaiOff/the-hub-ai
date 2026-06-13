import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { MoneytorApiError } from '@/lib/api/moneytor';
import {
  forceResyncMoneytorTransactionsForHousehold,
  ForceResyncRangeError,
} from '@/lib/api/moneytor-sync';
import { forceResyncMoneytorSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/moneytor/force-resync
 * Destructively re-pulls Moneytor transactions for a date range. Used when
 * Moneytor has corrected upstream data and the upsert-based incremental sync
 * doesn't surface the fix locally.
 *
 * Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = forceResyncMoneytorSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const summary = await forceResyncMoneytorTransactionsForHousehold(
      context.activeHousehold.id,
      validation.data
    );

    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    if (err instanceof ForceResyncRangeError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    if (err instanceof MoneytorApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code, renewUrl: err.renewUrl },
        { status: err.status ?? 400 }
      );
    }
    console.error('Moneytor force-resync failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Force re-sync failed unexpectedly. Check server logs.' },
      { status: 500 }
    );
  }
}
