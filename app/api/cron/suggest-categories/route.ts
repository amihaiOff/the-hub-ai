import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/utils/cron-logger';
import { drainSuggestions } from '@/lib/ai/drain-suggestions';

// AI categorization with web search takes a few seconds per transaction.
export const maxDuration = 60;

// Stop starting new work with headroom to spare under maxDuration so the run
// always returns cleanly (and logs its results) instead of being killed.
const DEADLINE_MS = 50_000;

/**
 * GET /api/cron/suggest-categories
 *
 * On-demand drain of uncategorized expenses the AI hasn't attempted yet, across
 * every household. NOTE: this is intentionally NOT registered as a Vercel cron
 * — the Hobby plan caps crons at once/day and two total, so the automatic
 * categorization relies on the post-import pass, the read-triggered pass (see
 * the transaction counts route), and a daily backstop folded into
 * /api/cron/daily-tasks. This endpoint remains for manual "drain now" runs (and
 * can be scheduled more frequently on paid plans).
 *
 * Protected by CRON_SECRET in production.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return withCronLog('/api/cron/suggest-categories', async () => {
    const results = await drainSuggestions(Date.now() + DEADLINE_MS);
    return {
      body: {
        success: true,
        message: 'Automatic categorization drain completed',
        results,
        timestamp: new Date().toISOString(),
      },
    };
  });
}
