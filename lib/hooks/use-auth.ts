'use client';

import { useUser as useStackUser, CurrentUser } from '@stackframe/stack';

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
 * Check if running in dev auth mode (SKIP_AUTH enabled)
 */
export function useIsDevAuthMode() {
  return isDevAuthMode;
}
