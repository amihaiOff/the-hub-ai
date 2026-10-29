/**
 * Route tests for the Web Push subscription API:
 *   POST   /api/push       (register this device)
 *   DELETE /api/push       (unregister this device)
 *   POST   /api/push/test  (send a test notification)
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: { upsert: jest.fn(), deleteMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/notifications/push', () => ({
  pushConfigured: jest.fn(),
  sendPushToHousehold: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { pushConfigured, sendPushToHousehold } from '@/lib/notifications/push';
import { POST, DELETE } from '../route';
import { POST as TEST } from '../test/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  pushSubscription: { upsert: jest.Mock; deleteMany: jest.Mock };
};
const mockPushConfigured = pushConfigured as jest.MockedFunction<typeof pushConfigured>;
const mockSend = sendPushToHousehold as jest.MockedFunction<typeof sendPushToHousehold>;

const mockContext = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
  households: [
    { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
  ],
  activeHousehold: {
    id: 'household-1',
    name: 'Test Household',
    description: null,
    role: 'owner' as const,
  },
  householdProfiles: [
    {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      role: 'owner' as const,
      hasUser: true,
    },
  ],
};

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const validSub = { endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };

function req(method: 'POST' | 'DELETE', body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/push', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/push', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockPrisma.pushSubscription.upsert.mockResolvedValue({});
  });

  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const res = await POST(req('POST', validSub));
    expect(res.status).toBe(401);
    expect(mockPrisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['a non-URL endpoint', { ...validSub, endpoint: 'not-a-url' }],
    ['missing keys', { endpoint: ENDPOINT }],
    ['an empty auth key', { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: '' } }],
  ])('returns 400 on %s', async (_label, body) => {
    const res = await POST(req('POST', body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe('string');
    expect(mockPrisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('upserts by endpoint with the active household id', async () => {
    const res = await POST(req('POST', validSub, { 'user-agent': 'Pixel Chrome' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    const data = {
      householdId: 'household-1',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      userAgent: 'Pixel Chrome',
    };
    expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT },
      create: { endpoint: ENDPOINT, ...data },
      update: data,
    });
  });

  it('truncates a long user agent to 300 chars', async () => {
    await POST(req('POST', validSub, { 'user-agent': 'x'.repeat(500) }));
    const call = mockPrisma.pushSubscription.upsert.mock.calls[0][0];
    expect(call.create.userAgent).toHaveLength(300);
  });
});

describe('DELETE /api/push', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const res = await DELETE(req('DELETE', { endpoint: ENDPOINT }));
    expect(res.status).toBe(401);
    expect(mockPrisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{oops'],
    ['a non-URL endpoint', { endpoint: 'nope' }],
    ['a missing endpoint', {}],
  ])('returns 400 on %s', async (_label, body) => {
    const res = await DELETE(req('DELETE', body));
    expect(res.status).toBe(400);
    expect(mockPrisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only the endpoint within the active household', async () => {
    const res = await DELETE(req('DELETE', { endpoint: ENDPOINT }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT, householdId: 'household-1' },
    });
  });
});

describe('POST /api/push/test', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockPushConfigured.mockReturnValue(true);
  });

  it('returns 401 without a context', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const res = await TEST();
    expect(res.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 503 when VAPID keys are not configured', async () => {
    mockPushConfigured.mockReturnValue(false);

    const res = await TEST();
    expect(res.status).toBe(503);
    expect((await res.json()).success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends a test push to the active household and returns the delivered count', async () => {
    mockSend.mockResolvedValue(2);

    const res = await TEST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { delivered: 2 } });
    expect(mockSend).toHaveBeenCalledWith(
      'household-1',
      expect.objectContaining({ title: 'The Hub', url: '/settings/notifications' })
    );
  });
});
