import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { runAndHandOff } from '@/lib/budget-report/generate';

// One agent step runs after the response, inside this invocation's 300s.
export const maxDuration = 300;

const bodySchema = z.object({ id: z.string().min(1) });

/**
 * POST /api/budget/reports/continue  { id }
 * Internal: runs the next ≤300s step of a report's agent and hands off to a
 * fresh invocation if it isn't finished. Answers immediately so the caller
 * only waits for the acknowledgement. Protected by CRON_SECRET in production.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    // Refuse outright if the secret is unset, rather than accepting "Bearer undefined".
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  after(() => runAndHandOff(parsed.data.id));
  return NextResponse.json({ success: true }, { status: 202 });
}
