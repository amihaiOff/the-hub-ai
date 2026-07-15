import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    household: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { getHouseholdIdFromApiKey, getHouseholdIdFromAgentKey } from '@/lib/auth-api-key';

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
