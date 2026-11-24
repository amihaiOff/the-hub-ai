import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSignedInUser } from '@/lib/auth-utils';
import {
  CODE_TTL_SECONDS,
  clientFingerprint,
  signMcpToken,
  verifyMcpToken,
  type McpClient,
} from '@/lib/mcp/tokens';

const PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'state',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'resource',
] as const;
type AuthorizeParams = Partial<Record<(typeof PARAMS)[number], string>>;

type Checked = { ok: true; client: McpClient; redirectUri: string } | { ok: false; error: string };

/** Validate an authorization request; never redirects to an unregistered URI. */
function check(p: AuthorizeParams): Checked {
  const client = verifyMcpToken<McpClient>('client', p.client_id);
  if (!client) return { ok: false, error: 'Unknown client. Remove and re-add the connector.' };
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    return { ok: false, error: 'The redirect address does not match the registered client.' };
  }
  if (p.response_type !== 'code') return { ok: false, error: 'Unsupported response_type.' };
  if (!p.code_challenge || p.code_challenge_method !== 'S256') {
    return { ok: false, error: 'PKCE (S256) is required.' };
  }
  return { ok: true, client, redirectUri: p.redirect_uri };
}

/**
 * The approving user, from the browser session only. An MCP access token must
 * never be able to approve a new connection for itself.
 */
async function sessionUser() {
  if ((await headers()).has('authorization')) return null;
  return getSignedInUser();
}

function withParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

function readForm(form: FormData): AuthorizeParams {
  return Object.fromEntries(
    PARAMS.map((k) => [k, (form.get(k) as string | null) ?? undefined])
  ) as AuthorizeParams;
}

async function approve(form: FormData) {
  'use server';
  const p = readForm(form);
  const checked = check(p);
  const user = await sessionUser();
  if (!checked.ok || !user) redirect('/oauth/authorize');
  const code = signMcpToken(
    'code',
    {
      uid: user.id,
      cid: clientFingerprint(p.client_id!),
      ru: checked.redirectUri,
      cc: p.code_challenge!,
    },
    CODE_TTL_SECONDS
  );
  redirect(withParams(checked.redirectUri, { code, state: p.state }));
}

async function deny(form: FormData) {
  'use server';
  const p = readForm(form);
  const checked = check(p);
  if (!checked.ok) redirect('/oauth/authorize');
  redirect(withParams(checked.redirectUri, { error: 'access_denied', state: p.state }));
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

/** OAuth consent screen: lets Claude (the Hub MCP connector) act as the signed-in user. */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const p: AuthorizeParams = Object.fromEntries(
    PARAMS.map((k) => [k, typeof raw[k] === 'string' ? raw[k] : undefined])
  );
  const checked = check(p);
  if (!checked.ok) {
    return (
      <Shell>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Can&apos;t connect</CardTitle>
          <CardDescription>{checked.error}</CardDescription>
        </CardHeader>
      </Shell>
    );
  }

  const user = await sessionUser();
  if (!user) {
    const defined = Object.entries(p).filter((e): e is [string, string] => !!e[1]);
    const back = `/oauth/authorize?${new URLSearchParams(defined)}`;
    redirect(`/handler/sign-in?after_auth_return_to=${encodeURIComponent(back)}`);
  }

  // Identify the app by where the code goes, not by its self-declared name.
  const target = new URL(checked.redirectUri).host;
  const appName = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(target)
    ? 'Claude Code (this computer)'
    : target;
  const hidden = PARAMS.map((k) =>
    p[k] ? <input key={k} type="hidden" name={k} value={p[k]} /> : null
  );

  return (
    <Shell>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Connect {appName} to The Hub?</CardTitle>
        <CardDescription>
          Signed in as <span className="text-foreground">{user.email}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>It can view and change everything you can in the app.</li>
          <li>
            It can&apos;t delete Areas pages or sections, restore or download backups, delete the
            household, change members or invites, share pages publicly, or read your Anthropic key.
          </li>
          <li>
            You&apos;ll be sent back to <span className="text-foreground">{target}</span>.
          </li>
        </ul>
        <div className="flex gap-3">
          <form action={deny} className="flex-1">
            {hidden}
            <Button type="submit" variant="secondary" className="w-full">
              Cancel
            </Button>
          </form>
          <form action={approve} className="flex-1">
            {hidden}
            <Button type="submit" className="w-full">
              Allow
            </Button>
          </form>
        </div>
      </CardContent>
    </Shell>
  );
}
