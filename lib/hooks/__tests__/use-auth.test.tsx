/**
 * Unit tests for use-auth.ts
 *
 * use-auth wraps Stack Auth's useUser and adds a dev-mode bypass. The module
 * reads env vars (NEXT_PUBLIC_SKIP_AUTH / NEXT_PUBLIC_STACK_PROJECT_ID) at
 * import time, so each branch is tested by re-importing the module with the
 * desired env via `loadModule`.
 */

import * as React from 'react';
import { renderHook, act } from '@testing-library/react';

// Mock Stack Auth. `useUser` delegates to a controllable jest.fn so we can
// simulate authed / unauthed / loading states.
const mockUseStackUser = jest.fn();
jest.mock('@stackframe/stack', () => ({
  useUser: () => mockUseStackUser(),
}));

type AuthModule = typeof import('../use-auth');

const ORIGINAL_ENV = { ...process.env };

/**
 * Re-import use-auth.ts with a fresh module registry and the given env vars so
 * the module-level `isDevAuthMode` / `hasStackConfig` constants are recomputed.
 */
function loadModule(env: Record<string, string | undefined>): AuthModule {
  jest.resetModules();
  // Reset the relevant env vars, then apply overrides.
  delete process.env.NEXT_PUBLIC_SKIP_AUTH;
  delete process.env.NEXT_PUBLIC_STACK_PROJECT_ID;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  // Pin React to the same instance the renderer uses; otherwise the fresh
  // module registry would give use-auth a second React copy whose hook
  // dispatcher is null during render.
  jest.doMock('react', () => React);
  // Re-require after mutating env + module registry so use-auth re-reads the
  // env at import time; require is the idiomatic Jest re-import here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../use-auth') as AuthModule;
}

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
  });
}

describe('use-auth', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearCookies();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('useUser', () => {
    it('returns the stable dev user in dev auth mode (SKIP_AUTH=true)', () => {
      const mod = loadModule({
        NEXT_PUBLIC_SKIP_AUTH: 'true',
        NEXT_PUBLIC_STACK_PROJECT_ID: 'proj-123',
      });

      const { result } = renderHook(() => mod.useUser());

      expect(result.current?.id).toBe('dev-user-local');
      expect(result.current?.primaryEmail).toBe('dev@localhost');
      // Stack Auth must not be consulted in dev mode.
      expect(mockUseStackUser).not.toHaveBeenCalled();
    });

    it('returns the dev user when Stack is not configured', () => {
      const mod = loadModule({
        NEXT_PUBLIC_SKIP_AUTH: undefined,
        NEXT_PUBLIC_STACK_PROJECT_ID: undefined,
      });

      const { result } = renderHook(() => mod.useUser());

      expect(result.current?.id).toBe('dev-user-local');
      expect(mockUseStackUser).not.toHaveBeenCalled();
    });

    it('delegates to Stack Auth when configured and not in dev mode', () => {
      const mod = loadModule({
        NEXT_PUBLIC_SKIP_AUTH: undefined,
        NEXT_PUBLIC_STACK_PROJECT_ID: 'proj-123',
      });
      const stackUser = { id: 'real-user', primaryEmail: 'real@example.com' };
      mockUseStackUser.mockReturnValue(stackUser);

      const { result } = renderHook(() => mod.useUser());

      expect(result.current).toBe(stackUser);
      expect(mockUseStackUser).toHaveBeenCalled();
    });

    it('returns null from Stack Auth when the user is unauthenticated', () => {
      const mod = loadModule({
        NEXT_PUBLIC_SKIP_AUTH: undefined,
        NEXT_PUBLIC_STACK_PROJECT_ID: 'proj-123',
      });
      mockUseStackUser.mockReturnValue(null);

      const { result } = renderHook(() => mod.useUser());

      expect(result.current).toBeNull();
    });
  });

  describe('dev user signOut', () => {
    it('redirects to home when the dev user signs out', async () => {
      const mod = loadModule({ NEXT_PUBLIC_SKIP_AUTH: 'true' });
      const { result } = renderHook(() => mod.useUser());

      // window.location is non-configurable in jsdom and a real href set is an
      // unimplemented no-op, so we cannot observe the redirect target directly.
      // Assert the dev user exposes a signOut that runs to completion without
      // throwing (this exercises the redirect branch).
      expect(typeof result.current?.signOut).toBe('function');

      await expect(
        act(async () => {
          await result.current?.signOut();
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('useIsDevAuthMode', () => {
    it('returns true when SKIP_AUTH is enabled', () => {
      const mod = loadModule({ NEXT_PUBLIC_SKIP_AUTH: 'true' });
      const { result } = renderHook(() => mod.useIsDevAuthMode());
      expect(result.current).toBe(true);
    });

    it('returns false when SKIP_AUTH is not enabled', () => {
      const mod = loadModule({ NEXT_PUBLIC_SKIP_AUTH: undefined });
      const { result } = renderHook(() => mod.useIsDevAuthMode());
      expect(result.current).toBe(false);
    });
  });

  describe('useAuthState', () => {
    it('returns the dev user and never loads in dev mode', () => {
      const mod = loadModule({ NEXT_PUBLIC_SKIP_AUTH: 'true' });

      const { result } = renderHook(() => mod.useAuthState());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.user?.id).toBe('dev-user-local');
      expect(mockUseStackUser).not.toHaveBeenCalled();
    });

    it('returns the dev user when Stack is not configured', () => {
      const mod = loadModule({
        NEXT_PUBLIC_SKIP_AUTH: undefined,
        NEXT_PUBLIC_STACK_PROJECT_ID: undefined,
      });

      const { result } = renderHook(() => mod.useAuthState());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.user?.id).toBe('dev-user-local');
    });

    it('is not loading once Stack Auth returns a user', () => {
      const mod = loadModule({
        NEXT_PUBLIC_SKIP_AUTH: undefined,
        NEXT_PUBLIC_STACK_PROJECT_ID: 'proj-123',
      });
      const stackUser = { id: 'real-user' };
      mockUseStackUser.mockReturnValue(stackUser);

      const { result } = renderHook(() => mod.useAuthState());

      // With a user present, loading is false regardless of the internal timer.
      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toBe(stackUser);
    });

    describe('with fake timers (no user yet)', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it('stops loading after the short timeout when no auth cookies exist', () => {
        const mod = loadModule({
          NEXT_PUBLIC_SKIP_AUTH: undefined,
          NEXT_PUBLIC_STACK_PROJECT_ID: 'proj-123',
        });
        mockUseStackUser.mockReturnValue(null);

        const { result } = renderHook(() => mod.useAuthState());

        // Starts in loading state while Stack Auth hydrates.
        expect(result.current.isLoading).toBe(true);
        expect(result.current.user).toBeNull();

        act(() => {
          jest.advanceTimersByTime(300);
        });

        expect(result.current.isLoading).toBe(false);
      });

      it('waits the longer timeout when Stack auth cookies are present', () => {
        document.cookie = 'stack-access-token=abc;path=/';

        const mod = loadModule({
          NEXT_PUBLIC_SKIP_AUTH: undefined,
          NEXT_PUBLIC_STACK_PROJECT_ID: 'proj-123',
        });
        mockUseStackUser.mockReturnValue(null);

        const { result } = renderHook(() => mod.useAuthState());

        expect(result.current.isLoading).toBe(true);

        // Short timeout should NOT have resolved loading yet.
        act(() => {
          jest.advanceTimersByTime(300);
        });
        expect(result.current.isLoading).toBe(true);

        // After the full 2000ms window, loading resolves.
        act(() => {
          jest.advanceTimersByTime(1700);
        });
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
