import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getHouseholdIdFromBackupToken } from '@/lib/auth-api-key';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * Where the scheduled Drive backup reports what happened.
 *
 * The script runs entirely outside this app (Google's scheduler, Google's
 * Drive), so without this the app would have no idea whether backups are still
 * happening. Each run posts its outcome here and it lands in the activity log,
 * which gives a visible history of "backups are working" rather than silence.
 *
 * This can only ever capture failures the script survived to report — a Drive
 * upload that was rejected, say. If the app itself is unreachable, nothing can
 * be logged here, which is exactly why the script also emails on failure. The
 * two channels cover different halves of the problem on purpose.
 */
const reportSchema = z.object({
  status: z.enum(['success', 'failure']),
  /** Bytes written to Drive. Present on success; lets the log show growth. */
  sizeBytes: z.number().int().nonnegative().optional(),
  /** Drive file name, so a log entry points at the actual archive. */
  fileName: z.string().trim().max(200).optional(),
  /** Why it failed. Kept short — it goes straight into the activity feed. */
  error: z.string().trim().max(500).optional(),
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function POST(request: NextRequest) {
  try {
    const householdId = await getHouseholdIdFromBackupToken(request);
    if (!householdId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = reportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const { status, sizeBytes, fileName, error } = parsed.data;

    const description =
      status === 'success'
        ? `Backup saved to Google Drive${fileName ? ` as ${fileName}` : ''}${
            sizeBytes !== undefined ? ` (${formatSize(sizeBytes)})` : ''
          }`
        : `Google Drive backup failed${error ? `: ${error}` : ''}`;

    await prisma.generalLog.create({
      data: {
        householdId,
        type: status === 'success' ? 'backup_succeeded' : 'backup_failed',
        subjectType: 'backup',
        subjectId: fileName ?? null,
        description,
        // A failure is left unread so it shows up as a badge. A success is
        // pre-read: a working backup shouldn't nag once a day forever.
        readAt: status === 'success' ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to record backup report:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to record backup report' },
      { status: 500 }
    );
  }
}
