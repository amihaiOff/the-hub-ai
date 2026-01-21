'use client';

import { useUser as useStackUser, CurrentUser } from '@stackframe/stack';
import { useState, useEffect } from 'react';

const isDevAuthMode =
  process.env.NEXT_PUBLIC_SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production';

// Check if Stack Auth is configured
const hasStackConfig = !!process.env.NEXT_PUBLIC_STACK_PROJECT_ID;

// Stable reference for dev user to prevent infinite re-renders
// Includes all properties that components might access
const DEV_USER = {
  id: 'dev-user-local',
  displayName: 'Dev User',
  primaryEmail: 'dev@localhost',
  profileImageUrl: null,
  signOut: async () => {
    // In dev mode, just reload the page
    window.location.href = '/';
  },
} as CurrentUser;

/**
 * Wrapper hook for Stack Auth's useUser that handles dev mode.
 * In dev mode (SKIP_AUTH=true) or when Stack is not configured, returns a mock user object.
 * In production with Stack configured, delegates to Stack Auth.
 */
export function useUser() {
  // In dev mode or when Stack isn't configured, return stable reference
  if (isDevAuthMode || !hasStackConfig) {
    return DEV_USER;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStackUser();
}

/**
 * Hook that returns user and loading state.
 * Used by AppShell to avoid redirecting while auth is still being checked.
 *
 * Stack Auth needs time to hydrate from cookies on the client.
 * We wait longer if auth cookies are present (user might be logged in).
 */
export function useAuthState(): { user: CurrentUser | null; isLoading: boolean } {
  const [isLoading, setIsLoading] = useState(!isDevAuthMode && hasStackConfig);

  // In dev mode or when Stack isn't configured, never loading
  if (isDevAuthMode || !hasStackConfig) {
    return { user: DEV_USER, isLoading: false };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const user = useStackUser();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    // If we have a user, we're done loading
    if (user) {
      setIsLoading(false);
      return;
    }

    // Check for auth cookies to determine wait time
    // If auth cookies exist, user might be logged in - wait for Stack Auth to hydrate
    // If no auth cookies, user is definitely not logged in
    const hasAuthCookies =
      typeof document !== 'undefined' &&
      (document.cookie.includes('stack-') || document.cookie.includes('__stack'));

    // Longer timeout if cookies exist (Stack Auth might be refreshing tokens)
    const timeout = hasAuthCookies ? 2000 : 300;

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, timeout);

    return () => clearTimeout(timer);
    // Empty dependency - only run once on mount
    // We handle user becoming non-null in the if (user) check above
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If user is present, we're definitely not loading
  return { user, isLoading: isLoading && !user };
}

/**
 * Check if running in dev auth mode (SKIP_AUTH enabled)
 */
export function useIsDevAuthMode() {
  return isDevAuthMode;
}
