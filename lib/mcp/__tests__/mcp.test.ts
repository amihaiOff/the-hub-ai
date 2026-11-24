import { join } from 'path';
import { mcpBlockReason } from '../blocked';
import { buildCatalog } from '../build-catalog';
import catalog from '../catalog.json';
import { pkceMatches, signMcpToken, verifyMcpToken } from '../tokens';

process.env.MCP_AUTH_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

describe('MCP tokens', () => {
  it('round-trips and rejects tampering, wrong kind and expiry', () => {
    const t = signMcpToken('access', { uid: 'u1' }, 60);
    expect(verifyMcpToken('access', t)).toMatchObject({ uid: 'u1' });
    expect(verifyMcpToken('refresh', t)).toBeNull();
    expect(verifyMcpToken('access', t + 'x')).toBeNull();
    expect(verifyMcpToken('access', signMcpToken('access', { uid: 'u1' }, -1))).toBeNull();
    expect(verifyMcpToken('access', 'garbage')).toBeNull();
    expect(verifyMcpToken('access', `${t}.extra`)).toBeNull();
  });

  it('rejects everything when the secret is missing', () => {
    const t = signMcpToken('access', { uid: 'u1' }, 60);
    const saved = process.env.MCP_AUTH_SECRET;
    delete process.env.MCP_AUTH_SECRET;
    expect(verifyMcpToken('access', t)).toBeNull();
    expect(() => signMcpToken('access', {})).toThrow();
    process.env.MCP_AUTH_SECRET = saved;
  });

  it('checks PKCE S256', () => {
    // RFC 7636 appendix B example
    expect(
      pkceMatches(
        'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
      )
    ).toBe(true);
    expect(pkceMatches('other', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(false);
  });
});

describe('MCP block list', () => {
  it.each([
    ['DELETE', '/api/pages/abc'],
    ['DELETE', '/api/pages/abc/'],
    ['DELETE', '/api/pages/sections/abc'],
    ['POST', '/api/restore'],
    ['DELETE', '/api/households/h1'],
    ['DELETE', '/api/households/h1/members/p1'],
    ['GET', '/api/settings/anthropic-key'],
  ])('blocks %s %s', (m, p) => expect(mcpBlockReason(m, p)).not.toBeNull());

  it.each([
    ['GET', '/api/pages/abc'],
    ['PATCH', '/api/pages/abc'],
    ['DELETE', '/api/pages/abc/tabs/t1'],
    ['DELETE', '/api/tasks/t1'],
    ['GET', '/api/households/h1'],
  ])('allows %s %s', (m, p) => expect(mcpBlockReason(m, p)).toBeNull());
});

describe('MCP catalog', () => {
  it('is up to date — run `npm run mcp:catalog` if this fails', () => {
    expect(buildCatalog(join(__dirname, '../../..'))).toEqual(catalog);
  });

  it('never lists a blocked action', () => {
    for (const a of catalog) {
      expect(mcpBlockReason(a.method, a.path.replace(/\{[^}]+\}/g, 'x'))).toBeNull();
    }
  });
});
