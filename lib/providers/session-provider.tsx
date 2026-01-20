'use client';

import { StackProvider, StackTheme, StackClientApp } from '@stackframe/stack';
import { stackClientApp } from '@/stack/client';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Skip Stack Auth in dev mode when stackClientApp is null
  if (!stackClientApp) {
    return <>{children}</>;
  }

  return (
    <StackProvider app={stackClientApp as StackClientApp<true, string>}>
      <StackTheme>{children}</StackTheme>
    </StackProvider>
  );
}
