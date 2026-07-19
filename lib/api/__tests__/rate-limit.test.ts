import { createRateLimiter } from '@/lib/api/rate-limit';

describe('createRateLimiter', () => {
  it('allows up to `max` hits per key within the window', () => {
    const limiter = createRateLimiter({ windowMs: 1_000, max: 3 });
    expect(limiter.tryAcquire('u1')).toBe(true);
    expect(limiter.tryAcquire('u1')).toBe(true);
    expect(limiter.tryAcquire('u1')).toBe(true);
    expect(limiter.tryAcquire('u1')).toBe(false); // 4th within window
  });

  it('tracks each key independently', () => {
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1 });
    expect(limiter.tryAcquire('u1')).toBe(true);
    expect(limiter.tryAcquire('u1')).toBe(false);
    expect(limiter.tryAcquire('u2')).toBe(true); // different key, fresh bucket
  });

  it('lets old hits fall out of the window', async () => {
    const limiter = createRateLimiter({ windowMs: 20, max: 1 });
    expect(limiter.tryAcquire('u1')).toBe(true);
    expect(limiter.tryAcquire('u1')).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(limiter.tryAcquire('u1')).toBe(true);
  });
});
