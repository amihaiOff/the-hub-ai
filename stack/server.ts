import 'server-only';
import { StackServerApp } from '@stackframe/stack';

const isDevAuthMode = process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production';

// Only initialize Stack Auth server if not in dev auth bypass mode
export const stackServerApp = isDevAuthMode
  ? (null as unknown as StackServerApp)
  : new StackServerApp({
      tokenStore: 'nextjs-cookie',
    });
