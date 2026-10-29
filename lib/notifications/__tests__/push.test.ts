/**
 * Unit tests for sendPushToHousehold — Web Push fan-out to every device
 * registered for a household.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: { findMany: jest.fn(), delete: jest.fn() },
  },
}));

jest.mock('web-push', () => ({
  __esModule: true,
  default: { sendNotification: jest.fn() },
}));

import webpush from 'web-push';
import { prisma } from '@/lib/db';
import { pushConfigured, sendPushToHousehold } from '../push';

const mockPrisma = prisma as unknown as {
  pushSubscription: { findMany: jest.Mock; delete: jest.Mock };
};
const mockSend = webpush.sendNotification as jest.Mock;

const ENV_KEYS = ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const subs = [
  { id: 'sub-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth: 'a1' },
  { id: 'sub-2', endpoint: 'https://push.example/2', p256dh: 'p2', auth: 'a2' },
];
const message = { title: 'Hi', body: 'There', url: '/x', tag: 't' };

describe('sendPushToHousehold', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub-key';
    process.env.VAPID_PRIVATE_KEY = 'priv-key';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
    mockPrisma.pushSubscription.findMany.mockResolvedValue(subs);
    mockPrisma.pushSubscription.delete.mockResolvedValue({});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
  });

  it.each([
    ['public key', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'],
    ['private key', 'VAPID_PRIVATE_KEY'],
  ])('returns 0 and sends nothing when the VAPID %s is unset', async (_label, key) => {
    delete process.env[key];

    expect(pushConfigured()).toBe(false);
    await expect(sendPushToHousehold('hh-1', message)).resolves.toBe(0);
    expect(mockPrisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('sends the message to every subscription of the household and counts deliveries', async () => {
    mockSend.mockResolvedValue({ statusCode: 201 });

    expect(pushConfigured()).toBe(true);
    await expect(sendPushToHousehold('hh-1', message)).resolves.toBe(2);

    expect(mockPrisma.pushSubscription.findMany).toHaveBeenCalledWith({
      where: { householdId: 'hh-1' },
    });
    expect(mockSend).toHaveBeenCalledTimes(2);
    const expectedOptions = {
      vapidDetails: {
        subject: 'mailto:test@example.com',
        publicKey: 'pub-key',
        privateKey: 'priv-key',
      },
      TTL: 86_400,
    };
    expect(mockSend).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/1', keys: { p256dh: 'p1', auth: 'a1' } },
      JSON.stringify(message),
      expectedOptions
    );
    expect(mockSend).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/2', keys: { p256dh: 'p2', auth: 'a2' } },
      JSON.stringify(message),
      expectedOptions
    );
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
  });

  it('falls back to a default VAPID subject when VAPID_SUBJECT is unset', async () => {
    delete process.env.VAPID_SUBJECT;
    mockSend.mockResolvedValue({});

    await sendPushToHousehold('hh-1', message);
    expect(mockSend.mock.calls[0][2].vapidDetails.subject).toMatch(/^mailto:/);
  });

  it('returns 0 when the household has no subscriptions', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValue([]);

    await expect(sendPushToHousehold('hh-1', message)).resolves.toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it.each([404, 410])(
    'deletes a subscription when the push service answers %i',
    async (statusCode) => {
      mockSend
        .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode }))
        .mockResolvedValueOnce({});

      await expect(sendPushToHousehold('hh-1', message)).resolves.toBe(1);
      expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
      expect(errorSpy).not.toHaveBeenCalled();
    }
  );

  it('logs (does not throw or delete) on other push errors', async () => {
    mockSend
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { statusCode: 500 }))
      .mockRejectedValueOnce(new Error('network down'));

    await expect(sendPushToHousehold('hh-1', message)).resolves.toBe(0);
    expect(mockPrisma.pushSubscription.delete).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('does not throw when deleting a stale subscription fails', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    mockPrisma.pushSubscription.delete.mockRejectedValue(new Error('db down'));

    await expect(sendPushToHousehold('hh-1', message)).resolves.toBe(0);
    expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledTimes(2);
  });

  it('returns 0 (never throws) when loading subscriptions fails', async () => {
    mockPrisma.pushSubscription.findMany.mockRejectedValue(new Error('db down'));

    await expect(sendPushToHousehold('hh-1', message)).resolves.toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
