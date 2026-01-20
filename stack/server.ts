import 'server-only';
import { StackServerApp } from '@stackframe/stack';

const isDevAuthMode = process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production';

// Check if Stack Auth env vars are configured
const hasStackConfig = !!process.env.NEXT_PUBLIC_STACK_PROJECT_ID;

// Only initialize Stack Auth server if not in dev auth bypass mode AND config exists
// This prevents build failures when env vars are not yet available
export const stackServerApp =
  isDevAuthMode || !hasStackConfig
    ? (null as unknown as StackServerApp)
    : new StackServerApp({
        tokenStore: 'nextjs-cookie',
      });
