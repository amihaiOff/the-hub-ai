import 'server-only';
import { StackServerApp } from '@stackframe/stack';
import { isAuthBypassed } from '@/lib/auth-env';

// Check if Stack Auth env vars are configured
const hasStackConfig = !!process.env.NEXT_PUBLIC_STACK_PROJECT_ID;

/**
 * The Stack Auth server client, or null when there's nothing to talk to:
 * either the dev bypass is active, or the env vars aren't configured (which
 * keeps builds from failing before secrets are wired up).
 *
 * Typed as nullable on purpose. This used to be cast to a non-null
 * `StackServerApp`, which hid the null from every caller and turned a missing
 * client into a runtime crash instead of a type error. Callers must handle
 * null — see `getCurrentUser` in `lib/auth-utils.ts`.
 *
 * The bypass check MUST come from `lib/auth-env.ts` and not be re-derived
 * here: if this file and `getCurrentUser` disagree about whether the bypass is
 * on, the result is a null client on a path that expects a real one.
 */
export const stackServerApp: StackServerApp | null =
  isAuthBypassed() || !hasStackConfig
    ? null
    : new StackServerApp({
        tokenStore: 'nextjs-cookie',
      });
