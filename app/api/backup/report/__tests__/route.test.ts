/**
 * Tests for /api/backup/report — where the scheduled Drive backup records
 * whether it worked, so the activity log shows a history instead of silence.
 */

const mockGetHouseholdIdFromBackupToken = jest.fn();
jest.mock('@/lib/auth-api-key', () => ({
  getHouseholdIdFromBackupToken: () => mockGetHouseholdIdFromBackupToken(),
}));

const mockPrisma = { generalLog: { create: jest.fn() } };
jest.mock('@/lib/db', () => ({ prisma: mockPrisma }));

import { NextRequest } from 'next/server';
import { POST } from '../route';

function post(body: unknown) {
  return new NextRequest('http://localhost/api/backup/report', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/backup/report', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetHouseholdIdFromBackupToken.mockResolvedValue('hh-1');
    mockPrisma.generalLog.create.mockResolvedValue({ id: 'log-1' });
  });

  it('rejects a caller without a valid backup token', async () => {
    mockGetHouseholdIdFromBackupToken.mockResolvedValue(null);

    const res = await POST(post({ status: 'success' }));

    expect(res.status).toBe(401);
    expect(mockPrisma.generalLog.create).not.toHaveBeenCalled();
  });

  it('rejects an unrecognised status', async () => {
    const res = await POST(post({ status: 'maybe' }));

    expect(res.status).toBe(400);
    expect(mockPrisma.generalLog.create).not.toHaveBeenCalled();
  });

  it('records a success, pre-read so a healthy backup does not nag daily', async () => {
    const res = await POST(
      post({ status: 'success', sizeBytes: 772243, fileName: 'hub-backup-2026-09-09-0300.zip' })
    );

    expect(res.status).toBe(200);
    const arg = mockPrisma.generalLog.create.mock.calls[0][0].data;
    expect(arg.householdId).toBe('hh-1');
    expect(arg.type).toBe('backup_succeeded');
    expect(arg.readAt).toBeInstanceOf(Date);
    expect(arg.description).toContain('hub-backup-2026-09-09-0300.zip');
    // Size is shown in human terms, not raw bytes.
    expect(arg.description).toContain('754 KB');
  });

  it('records a failure and leaves it unread so it surfaces as a badge', async () => {
    const res = await POST(post({ status: 'failure', error: 'Drive quota exceeded' }));

    expect(res.status).toBe(200);
    const arg = mockPrisma.generalLog.create.mock.calls[0][0].data;
    expect(arg.type).toBe('backup_failed');
    expect(arg.readAt).toBeNull();
    expect(arg.description).toContain('Drive quota exceeded');
  });

  it('accepts a success with no details', async () => {
    const res = await POST(post({ status: 'success' }));

    expect(res.status).toBe(200);
    expect(mockPrisma.generalLog.create.mock.calls[0][0].data.type).toBe('backup_succeeded');
  });
});
