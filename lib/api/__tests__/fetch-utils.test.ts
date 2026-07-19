import { fetchWithTimeout, fetchWithRetry } from '@/lib/api/fetch-utils';

// Silence the wall-clock waits in retry tests — same trick as moneytor.test.ts.
const realSetTimeout = global.setTimeout;
beforeAll(() => {
  global.setTimeout = ((fn: () => void) => {
    Promise.resolve().then(fn);
    return 0;
  }) as unknown as typeof setTimeout;
});
afterAll(() => {
  global.setTimeout = realSetTimeout;
});

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('passes response through when the upstream returns in time', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('ok', { status: 200 })) as unknown as typeof fetch;
    const res = await fetchWithTimeout('http://x', { timeoutMs: 1_000 });
    expect(res.status).toBe(200);
  });

  it('composes with an external AbortSignal', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        })
    ) as unknown as typeof fetch;
    const ac = new AbortController();
    const p = fetchWithTimeout('http://x', { signal: ac.signal, timeoutMs: 10_000 });
    ac.abort();
    await expect(p).rejects.toThrow();
  });
});

describe('fetchWithRetry', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns immediately on a 2xx (no retries)', async () => {
    const spy = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = spy as unknown as typeof fetch;
    const res = await fetchWithRetry('http://x', { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a 4xx (permanent failure)', async () => {
    const spy = jest.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    global.fetch = spy as unknown as typeof fetch;
    const res = await fetchWithRetry('http://x', { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(400);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx up to the attempts cap', async () => {
    const spy = jest.fn().mockResolvedValue(new Response('down', { status: 502 }));
    global.fetch = spy as unknown as typeof fetch;
    const res = await fetchWithRetry('http://x', { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(502);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('retries on network error and returns success if a later attempt works', async () => {
    const spy = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    global.fetch = spy as unknown as typeof fetch;
    const res = await fetchWithRetry('http://x', { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('rethrows the last error after exhausting attempts', async () => {
    const spy = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    global.fetch = spy as unknown as typeof fetch;
    await expect(fetchWithRetry('http://x', { attempts: 2, baseDelayMs: 1 })).rejects.toThrow(
      'ECONNRESET'
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('invokes onRetry for each retry', async () => {
    const onRetry = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('down', { status: 502 })) as unknown as typeof fetch;
    await fetchWithRetry('http://x', { attempts: 3, baseDelayMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2); // 2 retries between 3 attempts
  });
});
