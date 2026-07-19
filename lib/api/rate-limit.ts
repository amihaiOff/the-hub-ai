/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * Enough for "one user shouldn't hammer an external API in a tight loop"
 * — NOT enough for anti-abuse across a distributed deployment. If the
 * app ever runs multiple Node instances (multi-region Vercel, etc.),
 * this needs to move to Redis / Upstash. Documented so future us knows.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });
 *   if (!limiter.tryAcquire(userId)) return 429;
 */

interface Bucket {
  /** Timestamps (ms) of allowed hits within the current window. */
  hits: number[];
}

export interface RateLimiter {
  /**
   * Attempts to record one hit for the given key. Returns true if the
   * request should proceed, false if it would exceed the limit.
   */
  tryAcquire(key: string): boolean;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    tryAcquire(key: string): boolean {
      const now = Date.now();
      const cutoff = now - windowMs;
      const bucket = buckets.get(key) ?? { hits: [] };
      // Drop timestamps outside the window in-place.
      const kept: number[] = [];
      for (const t of bucket.hits) if (t > cutoff) kept.push(t);
      bucket.hits = kept;

      if (bucket.hits.length >= max) {
        buckets.set(key, bucket);
        return false;
      }

      bucket.hits.push(now);
      buckets.set(key, bucket);
      return true;
    },
  };
}
