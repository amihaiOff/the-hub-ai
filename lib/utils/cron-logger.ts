import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type CronResponseBody = { success: boolean; [key: string]: unknown };

export interface CronWorkResult {
  body: CronResponseBody;
  status?: number;
}

/**
 * Wraps a cron route's main work so every invocation persists a row to
 * `cron_run_logs`. Best-effort logging: if the DB write fails (e.g. transient
 * outage), the cron's actual response is unaffected — we just log the write
 * failure to stderr.
 *
 * Captures start/end time, duration, success flag, the full response body
 * (so per-task counts and failure arrays are queryable), and an error
 * message if the work itself threw.
 */
export async function withCronLog(
  cronPath: string,
  work: () => Promise<CronWorkResult>
): Promise<NextResponse> {
  const startedAt = new Date();
  let body: CronResponseBody;
  let status = 200;
  let threw = false;
  let errorMessage: string | null = null;

  try {
    const result = await work();
    body = result.body;
    status = result.status ?? 200;
    if (!body.success) {
      const maybeError = body.error;
      errorMessage =
        typeof maybeError === 'string'
          ? maybeError
          : 'cron reported success=false without error field';
    }
  } catch (err) {
    threw = true;
    errorMessage = err instanceof Error ? err.message : String(err);
    body = {
      success: false,
      error: 'Cron handler threw an unhandled exception. See server logs.',
    };
    status = 500;
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  try {
    await prisma.cronRunLog.create({
      data: {
        cronPath,
        startedAt,
        completedAt,
        durationMs,
        success: body.success,
        errorMessage,
        results: body as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (logErr) {
    console.error(`[cron-log] Failed to persist run log for ${cronPath}:`, logErr);
  }

  if (threw) {
    console.error(`[cron] ${cronPath} threw after ${durationMs}ms:`, errorMessage);
  }

  return NextResponse.json(body, { status });
}
