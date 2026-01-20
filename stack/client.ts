'use client';

import { StackClientApp } from '@stackframe/stack';

const isDevAuthMode =
  process.env.NEXT_PUBLIC_SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production';

// Check if Stack Auth env vars are configured
const hasStackConfig = !!process.env.NEXT_PUBLIC_STACK_PROJECT_ID;

// Create a lazily-initialized client that's only instantiated when not in dev mode and config exists
let _stackClientApp: StackClientApp | null = null;

function getStackClientApp(): StackClientApp | null {
  if (isDevAuthMode || !hasStackConfig) {
    return null;
  }
  if (!_stackClientApp) {
    _stackClientApp = new StackClientApp({
      tokenStore: 'nextjs-cookie',
    });
  }
  return _stackClientApp;
}

// Export the client (may be null in dev mode or when config is missing)
export const stackClientApp = getStackClientApp();
