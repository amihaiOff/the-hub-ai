/**
 * Regression tests for the onboarding loop.
 *
 * The household context query (['context', userId, householdId], staleTime
 * 60s) caches the pre-onboarding "no profile" result. If the page navigates
 * to '/' without invalidating it, AppShell reads the stale cache and bounces
 * the user straight back to /onboarding. These tests assert the page
 * invalidates ['context'] and waits for it BEFORE navigating.
 */

import * as React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OnboardingPage from '../page';

const callOrder: string[] = [];

const mockPush = jest.fn((path: string) => callOrder.push(`push:${path}`));
const mockReplace = jest.fn((path: string) => callOrder.push(`replace:${path}`));
const mockRefresh = jest.fn(() => callOrder.push('refresh'));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
}));

jest.mock('@/lib/hooks/use-auth', () => ({
  useUser: () => ({ id: 'user-1', displayName: 'Dana', primaryEmail: 'dana@example.com' }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** A promise we resolve by hand, to prove navigation awaits invalidation. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const pending = deferred();
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(((
    filters: unknown
  ) => {
    callOrder.push(`invalidate:${JSON.stringify(filters)}`);
    return pending.promise;
  }) as QueryClient['invalidateQueries']);

  render(
    <QueryClientProvider client={queryClient}>
      <OnboardingPage />
    </QueryClientProvider>
  );
  return { invalidateSpy, resolveInvalidate: pending.resolve };
}

/** Click through welcome -> profile -> household -> members -> Complete Setup. */
async function walkToCompletion() {
  fireEvent.click(screen.getByRole('button', { name: /get started/i }));
  // Profile name is prefilled from useUser().displayName.
  expect(screen.getByLabelText(/your name/i)).toHaveValue('Dana');
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  expect(screen.getByLabelText(/household name/i)).toHaveValue("Dana's Household");
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));
  });
}

const CONTEXT_FILTER = JSON.stringify({ queryKey: ['context'] });

describe('OnboardingPage context invalidation', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    callOrder.length = 0;
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRefresh.mockClear();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('invalidates the context query before router.push("/") after a successful setup', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    const { invalidateSpy, resolveInvalidate } = renderPage();

    await walkToCompletion();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/onboarding',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      profileName: 'Dana',
      profileColor: '#8fb4f5',
      householdName: "Dana's Household",
      familyMembers: [],
    });
    expect(screen.getByText(/you're all set/i)).toBeInTheDocument();

    // Nothing happens before the 2s redirect delay elapses.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1999);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['context'] });
    // Navigation must wait until the invalidation settles.
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      resolveInvalidate();
    });
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
    expect(callOrder).toEqual([`invalidate:${CONTEXT_FILTER}`, 'push:/', 'refresh']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('invalidates the context query before router.replace("/") when the user already has a profile', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'User already has a profile' }));
    const { invalidateSpy, resolveInvalidate } = renderPage();

    await walkToCompletion();

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['context'] });
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      resolveInvalidate();
    });
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(callOrder).toEqual([`invalidate:${CONTEXT_FILTER}`, 'replace:/']);
    expect(mockPush).not.toHaveBeenCalled();
    // The success step / delayed redirect never runs on this branch.
    expect(screen.queryByText(/you're all set/i)).not.toBeInTheDocument();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not invalidate or navigate on other API errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Database down' }));
    const { invalidateSpy } = renderPage();

    await walkToCompletion();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText('Database down')).toBeInTheDocument();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
