/**
 * What `getCurrentUser` does when there is no Stack Auth client.
 *
 * `stack/server.ts` exports null whenever the dev bypass is active OR the
 * Stack env vars are missing. If that condition and `isAuthBypassed` ever
 * disagree, this path runs with a null client — so it must resolve to "not
 * signed in" (callers then redirect to sign-in) rather than throwing, which
 * would surface as a 500 on every authenticated route. Both now read the same
 * predicate in `lib/auth-env.ts`, but the guard is what keeps a future drift
 * from becoming an outage.
 *
 * Lives in its own file because the main auth-utils suite mocks the module
 * with a live client, and swapping that mid-suite leaks into other tests.
 */

jest.mock('@/stack/server', () => ({ stackServerApp: null }));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: { upsert: jest.fn() },
    householdInvite: { findFirst: jest.fn() },
  },
}));

jest.mock('@/lib/invites', () => ({
  acceptPendingInvitesForUser: jest.fn(),
}));

import { getCurrentUser, getCurrentContext, isDevAuthMode } from '../auth-utils';

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('getCurrentUser with no Stack Auth client', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // A production deployment with SKIP_AUTH set: the flag is present but
    // refused, which is precisely the case that used to crash.
    setNodeEnv('production');
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.SKIP_AUTH = 'true';
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.SKIP_AUTH;
    setNodeEnv(originalNodeEnv || 'test');
  });

  it('refuses the bypass, so the dev user is never returned', () => {
    expect(isDevAuthMode()).toBe(false);
  });

  it('resolves to null rather than throwing', async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('warns so the misconfiguration is visible in logs', async () => {
    await getCurrentUser();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Stack Auth is not configured'));
  });

  it('makes getCurrentContext return null too, which routes map to a 401', async () => {
    await expect(getCurrentContext()).resolves.toBeNull();
  });
});
