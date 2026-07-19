/**
 * Shared HTTP helpers for external API calls.
 *
 * - `fetchWithTimeout` — fetch that aborts if the upstream takes longer
 *   than `timeoutMs` (default 10s). Every external-API call in this
 *   codebase should go through this instead of raw `fetch` so a slow
 *   Yahoo/Alpha-Vantage/Moneytor doesn't stall a whole dashboard
 *   request.
 * - `fetchWithRetry` — layers exponential backoff (1s / 2s / 4s) on
 *   top of the timeout. Retries on network errors and 5xx responses.
 *   Does NOT retry on 4xx (auth failures, bad requests) — those are
 *   permanent and should fail fast.
 *
 * Both helpers preserve the standard `Response` shape so callers can
 * still `.ok`, `.json()`, `.status` as usual.
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  /** Milliseconds before the request is aborted. Default 10_000. */
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = 10_000, signal: externalSignal, ...rest } = init;

  // Compose the external abort signal (if any) with our timeout so both
  // paths cancel the fetch cleanly.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason));
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface FetchWithRetryOptions extends FetchWithTimeoutOptions {
  /** Number of attempts (including the first). Default 3. */
  attempts?: number;
  /** Base delay in ms; each retry doubles it (1000 → 2000 → 4000). */
  baseDelayMs?: number;
  /** Called on each retry with the reason. Handy for logging. */
  onRetry?: (attempt: number, reason: string) => void;
}

/**
 * Fetch with timeout + exponential backoff on network errors and 5xx.
 * 4xx responses are returned immediately (permanent failures should
 * fail fast; don't hammer the upstream with retries when it's told us
 * the request is invalid).
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: FetchWithRetryOptions = {}
): Promise<Response> {
  const { attempts = 3, baseDelayMs = 1000, onRetry, ...rest } = init;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetchWithTimeout(input, rest);
      // Retryable: 5xx (server side hiccups).
      if (response.status >= 500 && response.status < 600 && i < attempts - 1) {
        onRetry?.(i + 1, `HTTP ${response.status}`);
        await sleep(baseDelayMs * 2 ** i);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      // Retryable: network errors + our own timeout aborts.
      if (i < attempts - 1) {
        const reason = error instanceof Error ? error.message : String(error);
        onRetry?.(i + 1, reason);
        await sleep(baseDelayMs * 2 ** i);
        continue;
      }
      throw error;
    }
  }
  // Unreachable in practice (loop either returns or throws), but TS
  // wants an explicit tail.
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
