'use client';

import { StackClientApp } from '@stackframe/stack';

const isDevAuthMode =
  process.env.NEXT_PUBLIC_SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production';

// Create a lazily-initialized client that's only instantiated when not in dev mode
let _stackClientApp: StackClientApp | null = null;

function getStackClientApp(): StackClientApp | null {
  if (isDevAuthMode) {
    return null;
  }
  if (!_stackClientApp) {
    _stackClientApp = new StackClientApp({
      tokenStore: 'nextjs-cookie',
    });
  }
  return _stackClientApp;
}

// Export the client (may be null in dev mode)
export const stackClientApp = getStackClientApp();
