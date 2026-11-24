/**
 * OAuth endpoints for the Hub MCP connector: dynamic client registration and
 * the token endpoint (authorization_code + PKCE, refresh_token).
 */
import { createHash } from 'crypto';
import { POST as register } from '@/app/oauth/register/route';
import { POST as token } from '@/app/oauth/token/route';
import { clientFingerprint, signMcpToken, verifyMcpToken } from '../tokens';

process.env.MCP_AUTH_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'verifier-0123456789-abcdefghijklmnopqrstuvwxyz';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function registerReq(body: unknown) {
  return new Request('http://localhost/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function tokenReq(params: Record<string, string>, json = false) {
  return new Request('http://localhost/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded',
    },
    body: json ? JSON.stringify(params) : new URLSearchParams(params).toString(),
  });
}

function client(redirectUris = [REDIRECT]) {
  return signMcpToken('client', { redirect_uris: redirectUris });
}

function code(clientId: string, overrides: Record<string, unknown> = {}) {
  return signMcpToken(
    'code',
    { uid: 'user-1', cid: clientFingerprint(clientId), ru: REDIRECT, cc: CHALLENGE, ...overrides },
    300
  );
}

describe('POST /oauth/register', () => {
  it('accepts https redirect URIs and returns a signed client id', async () => {
    const res = await register(registerReq({ redirect_uris: [REDIRECT], client_name: 'Claude' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.redirect_uris).toEqual([REDIRECT]);
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(verifyMcpToken('client', body.client_id)).toMatchObject({
      redirect_uris: [REDIRECT],
      name: 'Claude',
    });
  });

  it.each([
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:33418/callback',
    'http://127.0.0.1:5000/cb',
    'http://[::1]:5000/cb',
  ])('accepts Claude / loopback redirect %s', async (uri) => {
    const res = await register(registerReq({ redirect_uris: [uri] }));
    expect(res.status).toBe(201);
  });

  it.each([
    [['http://evil.example.com/cb']],
    [[REDIRECT, 'http://evil.example.com/cb']],
    [['https://claude.ai/cb#frag']],
    [['https://claude.ai/api/mcp/auth_callback#x']],
    [['https://claude.ai/other']],
    [['https://attacker.example/api/mcp/auth_callback']],
    [['https://claude.ai.evil.com/api/mcp/auth_callback']],
    [['http://localhost:5000/cb#frag']],
    [['http://localhost.evil.com/cb']],
    [['javascript:alert(1)']],
    [['not a url']],
    [[]],
    [Array.from({ length: 11 }, (_, i) => `http://localhost/${i}`)],
  ])('rejects redirect_uris %j', async (uris) => {
    const res = await register(registerReq({ redirect_uris: uris }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_redirect_uri');
  });

  it('rejects a missing / malformed body', async () => {
    expect((await register(registerReq({}))).status).toBe(400);
    const bad = new Request('http://localhost/oauth/register', { method: 'POST', body: '{' });
    expect((await register(bad)).status).toBe(400);
  });
});

describe('POST /oauth/token', () => {
  describe('authorization_code grant', () => {
    it('issues access + refresh tokens for a valid code and PKCE verifier', async () => {
      const cid = client();
      const res = await token(
        tokenReq({
          grant_type: 'authorization_code',
          client_id: cid,
          code: code(cid),
          redirect_uri: REDIRECT,
          code_verifier: VERIFIER,
        })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = await res.json();
      expect(body.token_type).toBe('Bearer');
      expect(verifyMcpToken('access', body.access_token)).toMatchObject({ uid: 'user-1' });
      expect(verifyMcpToken('refresh', body.refresh_token)).toMatchObject({
        uid: 'user-1',
        cid: clientFingerprint(cid),
      });
    });

    it('also accepts a JSON body', async () => {
      const cid = client();
      const res = await token(
        tokenReq(
          {
            grant_type: 'authorization_code',
            client_id: cid,
            code: code(cid),
            redirect_uri: REDIRECT,
            code_verifier: VERIFIER,
          },
          true
        )
      );
      expect(res.status).toBe(200);
    });

    it('rejects a wrong PKCE verifier', async () => {
      const cid = client();
      const res = await token(
        tokenReq({
          grant_type: 'authorization_code',
          client_id: cid,
          code: code(cid),
          redirect_uri: REDIRECT,
          code_verifier: 'wrong-verifier',
        })
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects a missing PKCE verifier', async () => {
      const cid = client();
      const res = await token(
        tokenReq({
          grant_type: 'authorization_code',
          client_id: cid,
          code: code(cid),
          redirect_uri: REDIRECT,
        })
      );
      expect(res.status).toBe(400);
    });

    it('rejects a redirect_uri that differs from the one in the code', async () => {
      const cid = client();
      const res = await token(
        tokenReq({
          grant_type: 'authorization_code',
          client_id: cid,
          code: code(cid),
          redirect_uri: 'https://claude.ai/other',
          code_verifier: VERIFIER,
        })
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects a code issued to a different client', async () => {
      const cidA = client();
      const cidB = client(['http://localhost:9999/cb']);
      const res = await token(
        tokenReq({
          grant_type: 'authorization_code',
          client_id: cidB,
          code: code(cidA),
          redirect_uri: REDIRECT,
          code_verifier: VERIFIER,
        })
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects an expired code', async () => {
      const cid = client();
      const expired = signMcpToken(
        'code',
        { uid: 'user-1', cid: clientFingerprint(cid), ru: REDIRECT, cc: CHALLENGE },
        -1
      );
      const res = await token(
        tokenReq({
          grant_type: 'authorization_code',
          client_id: cid,
          code: expired,
          redirect_uri: REDIRECT,
          code_verifier: VERIFIER,
        })
      );
      expect(res.status).toBe(400);
    });

    it('rejects an access token passed off as a code', async () => {
      const cid = client();
      const res = await token(
        tokenReq({
          grant_type: 'authorization_code',
          client_id: cid,
          code: signMcpToken('access', { uid: 'user-1' }, 60),
          redirect_uri: REDIRECT,
          code_verifier: VERIFIER,
        })
      );
      expect(res.status).toBe(400);
    });
  });

  it('rejects an unknown / forged client id with 401', async () => {
    const res = await token(
      tokenReq({ grant_type: 'refresh_token', client_id: 'hubmcp_forged.sig', refresh_token: 'x' })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_client' });
    expect((await token(tokenReq({ grant_type: 'refresh_token' }))).status).toBe(401);
  });

  describe('refresh_token grant', () => {
    it('issues new tokens for a valid refresh token from the same client', async () => {
      const cid = client();
      const refresh = signMcpToken('refresh', { uid: 'user-1', cid: clientFingerprint(cid) }, 3600);
      const res = await token(
        tokenReq({ grant_type: 'refresh_token', client_id: cid, refresh_token: refresh })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(verifyMcpToken('access', body.access_token)).toMatchObject({ uid: 'user-1' });
    });

    it('rejects a refresh token issued to another client', async () => {
      const cidA = client();
      const cidB = client(['http://localhost:9999/cb']);
      const refresh = signMcpToken(
        'refresh',
        { uid: 'user-1', cid: clientFingerprint(cidA) },
        3600
      );
      const res = await token(
        tokenReq({ grant_type: 'refresh_token', client_id: cidB, refresh_token: refresh })
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('rejects an access token used as a refresh token', async () => {
      const cid = client();
      const res = await token(
        tokenReq({
          grant_type: 'refresh_token',
          client_id: cid,
          refresh_token: signMcpToken('access', { uid: 'user-1', cid: clientFingerprint(cid) }, 60),
        })
      );
      expect(res.status).toBe(400);
    });
  });

  it('treats a null / non-object JSON body as an unknown client (not a 500)', async () => {
    for (const raw of ['null', '[]', '42', '{']) {
      const r = new Request('http://localhost/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      });
      expect((await token(r)).status).toBe(401);
    }
  });

  it('ignores non-string params', async () => {
    const cid = client();
    const r = new Request('http://localhost/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: [cid] }),
    });
    expect((await token(r)).status).toBe(401);
    const res = await token(
      new Request('http://localhost/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: cid,
          code: code(cid),
          redirect_uri: REDIRECT,
          code_verifier: { toString: VERIFIER },
        }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects unsupported grant types', async () => {
    const res = await token(tokenReq({ grant_type: 'password', client_id: client() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'unsupported_grant_type' });
  });
});
