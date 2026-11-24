/**
 * auth-utils: the Hub MCP branch of resolveSignedInUser — a `Bearer hubmcp_…`
 * access token stands in for the Stack Auth session cookie.
 */
import { signMcpToken } from '@/lib/mcp/tokens';

process.env.MCP_AUTH_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

const mockGetUser = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserUpsert = jest.fn();
const mockInviteFindFirst = jest.fn();
const mockMemberFindMany = jest.fn();
const mockHeadersGet = jest.fn();
const mockAcceptInvites = jest.fn();

jest.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => mockHeadersGet(name) }),
}));
jest.mock('@/stack/server', () => ({ stackServerApp: { getUser: () => mockGetUser() } }));
jest.mock('@/lib/invites', () => ({
  acceptPendingInvitesForUser: (...a: unknown[]) => mockAcceptInvites(...a),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
      upsert: (...a: unknown[]) => mockUserUpsert(...a),
    },
    householdInvite: { findFirst: (...a: unknown[]) => mockInviteFindFirst(...a) },
    householdMember: { findMany: (...a: unknown[]) => mockMemberFindMany(...a) },
  },
}));

const DB_USER = { id: 'user-1', email: 'Owner@Example.com', name: 'Owner' };

function withHeaders(h: Record<string, string>) {
  mockHeadersGet.mockImplementation((name: string) => h[name.toLowerCase()] ?? null);
}

async function load() {
  jest.resetModules();
  return import('@/lib/auth-utils');
}

describe('auth-utils MCP bearer', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.SKIP_AUTH;
    process.env.ALLOWED_EMAILS = 'owner@example.com';
    mockUserFindUnique.mockResolvedValue(DB_USER);
    mockInviteFindFirst.mockResolvedValue(null);
    mockMemberFindMany.mockResolvedValue([]);
    mockGetUser.mockResolvedValue({
      id: 'stack-user',
      primaryEmail: 'owner@example.com',
      displayName: 'Cookie User',
    });
  });

  afterAll(() => {
    process.env = saved;
  });

  it('resolves a valid access token to its user (allowlist is case-insensitive)', async () => {
    withHeaders({ authorization: `Bearer ${signMcpToken('access', { uid: 'user-1' }, 60)}` });
    const { getSignedInUser } = await load();
    expect(await getSignedInUser()).toEqual(DB_USER);
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('getCurrentUser applies section restrictions to MCP users too', async () => {
    withHeaders({
      authorization: `Bearer ${signMcpToken('access', { uid: 'user-1' }, 60)}`,
      'x-pathname': '/api/budget/summary',
    });
    mockMemberFindMany.mockResolvedValue([{ allowedSections: ['tasks'] }]);
    const { getCurrentUser } = await load();
    expect(await getCurrentUser()).toBeNull();
  });

  it.each([
    ['forged', 'hubmcp_eyJ1aWQiOiJ1c2VyLTEiLCJrIjoiYWNjZXNzIn0.forged'],
    ['expired', () => signMcpToken('access', { uid: 'user-1' }, -1)],
    ['wrong kind (refresh)', () => signMcpToken('refresh', { uid: 'user-1', cid: 'c' }, 60)],
  ])('an invalid token (%s) does not fall back to Stack cookies', async (_label, tok) => {
    const t = typeof tok === 'function' ? tok() : tok;
    withHeaders({ authorization: `Bearer ${t}` });
    const { getSignedInUser } = await load();
    expect(await getSignedInUser()).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when the token user no longer exists', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    withHeaders({ authorization: `Bearer ${signMcpToken('access', { uid: 'gone' }, 60)}` });
    const { getSignedInUser } = await load();
    expect(await getSignedInUser()).toBeNull();
  });

  it('returns null for a user no longer on the allowlist and without an invite', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user-2', email: 'x@other.com', name: null });
    withHeaders({ authorization: `Bearer ${signMcpToken('access', { uid: 'user-2' }, 60)}` });
    const { getSignedInUser } = await load();
    expect(await getSignedInUser()).toBeNull();
    expect(mockInviteFindFirst).toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('allows a non-allowlisted user who holds an invite / membership', async () => {
    const invitee = { id: 'user-2', email: 'x@other.com', name: null };
    mockUserFindUnique.mockResolvedValue(invitee);
    mockInviteFindFirst.mockResolvedValue({ id: 'inv-1' });
    withHeaders({ authorization: `Bearer ${signMcpToken('access', { uid: 'user-2' }, 60)}` });
    const { getSignedInUser } = await load();
    expect(await getSignedInUser()).toEqual(invitee);
  });

  it('a non-MCP bearer still goes through Stack Auth', async () => {
    mockUserUpsert.mockResolvedValue({
      id: 'db-1',
      email: 'owner@example.com',
      name: 'Cookie User',
    });
    withHeaders({ authorization: 'Bearer some-agent-token' });
    const { getSignedInUser } = await load();
    expect(await getSignedInUser()).toMatchObject({ id: 'db-1' });
    expect(mockGetUser).toHaveBeenCalled();
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('SKIP_AUTH bypass wins over an MCP token (dev/preview)', async () => {
    process.env.SKIP_AUTH = 'true';
    mockUserUpsert.mockResolvedValue({});
    withHeaders({ authorization: `Bearer ${signMcpToken('access', { uid: 'user-1' }, 60)}` });
    const { getSignedInUser } = await load();
    expect((await getSignedInUser())?.id).toBe('dev-user-local');
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });
});
