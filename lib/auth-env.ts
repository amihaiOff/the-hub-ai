/**
 * The single source of truth for "is the dev auth bypass active?".
 *
 * This lives in its own module with no imports because TWO places need the
 * same answer and they must never disagree: `lib/auth-utils.ts` (which returns
 * a canned dev user) and `stack/server.ts` (which decides whether to construct
 * the Stack Auth client at all). When those two drifted apart, "bypass
 * refused" meant a null auth client and a crash on every authenticated route
 * instead of a sign-in prompt.
 */

/**
 * True when `SKIP_AUTH=true` AND this is not a production deployment.
 *
 * `NODE_ENV` cannot gate this on its own: Vercel builds preview deployments
 * with `NODE_ENV=production` too, so it can't tell preview from production.
 * `VERCEL_ENV` is the discriminator.
 *
 * The cases, in order:
 * - `SKIP_AUTH` not exactly `'true'` → never bypass. The flag is opt-in and
 *   must be explicit.
 * - `VERCEL_ENV` set → bypass on anything except `production`. This is what
 *   keeps the deliberate preview bypass working.
 * - On Vercel but `VERCEL_ENV` absent → refuse. An unidentifiable deployment
 *   is the last place to be lenient about who's logged in. (Happens if the
 *   project's "expose System Environment Variables" setting is off, in which
 *   case preview asks for a login rather than silently bypassing.)
 * - Not on Vercel at all → bypass. A developer's machine, including a local
 *   production build (`npm run build && npm start`), which is a documented
 *   workflow for perf measurement.
 */
export function isAuthBypassed(): boolean {
  if (process.env.SKIP_AUTH !== 'true') return false;

  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv !== 'production';
  if (process.env.VERCEL) return false;

  return true;
}
