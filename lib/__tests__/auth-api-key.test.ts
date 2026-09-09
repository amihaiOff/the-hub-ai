import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    household: {
      findFirst: jest.fn(),
    },
    householdMember: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  getHouseholdIdFromApiKey,
  getHouseholdIdFromAgentKey,
  getPagesHouseholdIdFromToken,
  getHouseholdIdFromBackupToken,
  resolveHouseholdOwnerUserId,
} from '@/lib/auth-api-key';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers['authorization'] = authHeader;
  }
  return new NextRequest('http://localhost:3000/api/test', { headers });
}

describe('getHouseholdIdFromApiKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return null when API_SECRET is not set', async () => {
    delete process.env.API_SECRET;
    const result = await getHouseholdIdFromApiKey(makeRequest('Bearer some-key'));
    expect(result).toBeNull();
  });

  it('should return null when no authorization header', async () => {
    process.env.API_SECRET = 'test-secret';
    const result = await getHouseholdIdFromApiKey(makeRequest());
    expect(result).toBeNull();
  });

  it('should return null when token does not match', async () => {
    process.env.API_SECRET = 'test-secret';
    const result = await getHouseholdIdFromApiKey(makeRequest('Bearer wrong-key'));
    expect(result).toBeNull();
  });

  it('should return null for non-Bearer auth', async () => {
    process.env.API_SECRET = 'test-secret';
    const result = await getHouseholdIdFromApiKey(makeRequest('Basic dXNlcjpwYXNz'));
    expect(result).toBeNull();
  });

  it('should return household ID when token matches', async () => {
    process.env.API_SECRET = 'test-secret';
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'household-1',
    });

    const result = await getHouseholdIdFromApiKey(makeRequest('Bearer test-secret'));
    expect(result).toBe('household-1');
  });

  it('should return null when no household exists', async () => {
    process.env.API_SECRET = 'test-secret';
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const result = await getHouseholdIdFromApiKey(makeRequest('Bearer test-secret'));
    expect(result).toBeNull();
  });

  it('rejects the read-only agent token (write path stays admin-only)', async () => {
    process.env.API_SECRET = 'admin-secret';
    process.env.AGENT_READ_TOKEN = 'read-token';
    const result = await getHouseholdIdFromApiKey(makeRequest('Bearer read-token'));
    expect(result).toBeNull();
  });
});

describe('getHouseholdIdFromAgentKey', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.API_SECRET;
    delete process.env.UPLOAD_SCRIPT_API_KEY;
    delete process.env.AGENT_READ_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts the dedicated read-only token', async () => {
    process.env.AGENT_READ_TOKEN = 'read-token';
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'hh-1' });
    const result = await getHouseholdIdFromAgentKey(makeRequest('Bearer read-token'));
    expect(result).toBe('hh-1');
  });

  it('also accepts the full-access API secret', async () => {
    process.env.API_SECRET = 'admin-secret';
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'hh-1' });
    const result = await getHouseholdIdFromAgentKey(makeRequest('Bearer admin-secret'));
    expect(result).toBe('hh-1');
  });

  it('rejects an unknown token', async () => {
    process.env.AGENT_READ_TOKEN = 'read-token';
    const result = await getHouseholdIdFromAgentKey(makeRequest('Bearer nope'));
    expect(result).toBeNull();
  });

  it('returns null when no tokens are configured', async () => {
    const result = await getHouseholdIdFromAgentKey(makeRequest('Bearer anything'));
    expect(result).toBeNull();
  });
});

describe('getPagesHouseholdIdFromToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.API_SECRET;
    delete process.env.UPLOAD_SCRIPT_API_KEY;
    delete process.env.AGENT_READ_TOKEN;
    delete process.env.AGENT_PAGES_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts the dedicated pages token', async () => {
    process.env.AGENT_PAGES_TOKEN = 'pages-token';
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'hh-1' });
    const result = await getPagesHouseholdIdFromToken(makeRequest('Bearer pages-token'));
    expect(result).toBe('hh-1');
  });

  it('also accepts the full-access API secret', async () => {
    process.env.API_SECRET = 'admin-secret';
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'hh-1' });
    const result = await getPagesHouseholdIdFromToken(makeRequest('Bearer admin-secret'));
    expect(result).toBe('hh-1');
  });

  it('rejects the read-only backlog token (pages token is a separate scope)', async () => {
    process.env.AGENT_READ_TOKEN = 'read-token';
    process.env.AGENT_PAGES_TOKEN = 'pages-token';
    const result = await getPagesHouseholdIdFromToken(makeRequest('Bearer read-token'));
    expect(result).toBeNull();
  });

  it('rejects an unknown token', async () => {
    process.env.AGENT_PAGES_TOKEN = 'pages-token';
    const result = await getPagesHouseholdIdFromToken(makeRequest('Bearer nope'));
    expect(result).toBeNull();
  });

  it('returns null when the token matches but no household exists', async () => {
    process.env.AGENT_PAGES_TOKEN = 'pages-token';
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const result = await getPagesHouseholdIdFromToken(makeRequest('Bearer pages-token'));
    expect(result).toBeNull();
  });

  it('returns null when no tokens are configured', async () => {
    const result = await getPagesHouseholdIdFromToken(makeRequest('Bearer anything'));
    expect(result).toBeNull();
  });
});

describe('resolveHouseholdOwnerUserId', () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns the owner member's linked user id", async () => {
    (mockPrisma.householdMember.findFirst as jest.Mock).mockResolvedValueOnce({
      profile: { userId: 'user-1' },
    });
    const result = await resolveHouseholdOwnerUserId('hh-1');
    expect(result).toBe('user-1');
    // Scopes to an owner member of this household whose profile has a login user.
    const where = (mockPrisma.householdMember.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.householdId).toBe('hh-1');
    expect(where.role).toBe('owner');
    expect(where.profile.userId).toEqual({ not: null });
  });

  it('returns null when the household has no login owner', async () => {
    (mockPrisma.householdMember.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const result = await resolveHouseholdOwnerUserId('hh-1');
    expect(result).toBeNull();
  });
});

describe('getHouseholdIdFromBackupToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    (mockPrisma.household.findFirst as jest.Mock).mockResolvedValue({ id: 'hh-1' });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts the dedicated backup token', async () => {
    process.env.BACKUP_TOKEN = 'backup-secret';

    await expect(getHouseholdIdFromBackupToken(makeRequest('Bearer backup-secret'))).resolves.toBe(
      'hh-1'
    );
  });

  it('accepts the full-access admin secret', async () => {
    process.env.API_SECRET = 'admin-secret';

    await expect(getHouseholdIdFromBackupToken(makeRequest('Bearer admin-secret'))).resolves.toBe(
      'hh-1'
    );
  });

  it('rejects a missing header, a wrong token, and a non-Bearer scheme', async () => {
    process.env.BACKUP_TOKEN = 'backup-secret';

    await expect(getHouseholdIdFromBackupToken(makeRequest())).resolves.toBeNull();
    await expect(getHouseholdIdFromBackupToken(makeRequest('Bearer nope'))).resolves.toBeNull();
    await expect(
      getHouseholdIdFromBackupToken(makeRequest('Basic backup-secret'))
    ).resolves.toBeNull();
  });

  it('does NOT accept the narrower agent or pages tokens', async () => {
    // The whole point of a separate secret: this endpoint can pull everything,
    // so a token handed to an agent for read-only page access must not unlock it.
    process.env.BACKUP_TOKEN = 'backup-secret';
    process.env.AGENT_READ_TOKEN = 'agent-token';
    process.env.AGENT_PAGES_TOKEN = 'pages-token';

    await expect(
      getHouseholdIdFromBackupToken(makeRequest('Bearer agent-token'))
    ).resolves.toBeNull();
    await expect(
      getHouseholdIdFromBackupToken(makeRequest('Bearer pages-token'))
    ).resolves.toBeNull();
  });

  it('rejects everything when no backup secret is configured', async () => {
    delete process.env.BACKUP_TOKEN;
    delete process.env.API_SECRET;

    await expect(getHouseholdIdFromBackupToken(makeRequest('Bearer anything'))).resolves.toBeNull();
    await expect(getHouseholdIdFromBackupToken(makeRequest('Bearer '))).resolves.toBeNull();
  });
});
