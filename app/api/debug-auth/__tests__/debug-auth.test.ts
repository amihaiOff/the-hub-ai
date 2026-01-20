/**
 * Integration tests for /api/debug-auth endpoint
 * Tests auth debugging functionality
 */

// Store original env
const originalEnv = { ...process.env };

// Mock cookies from next/headers
const mockCookies = jest.fn();
jest.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}));

// Mock Stack Auth
const mockGetUser = jest.fn();
jest.mock('@/stack/server', () => ({
  stackServerApp: {
    getUser: () => mockGetUser(),
  },
}));

// Mock Prisma
const mockPrisma = {
  user: {
    count: jest.fn(),
  },
  profile: {
    count: jest.fn(),
  },
};
jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

// Mock auth-utils
const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

import { GET } from '../route';

describe('Debug Auth API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Reset env
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const setupMocks = (options: {
    cookies?: { name: string; value: string }[];
    stackUser?: { id: string; primaryEmail: string; displayName: string } | null;
    stackError?: Error;
    dbUserCount?: number;
    dbProfileCount?: number;
    dbError?: Error;
    currentUser?: { id: string } | null;
    currentUserError?: Error;
  }) => {
    mockCookies.mockResolvedValue({
      getAll: () => options.cookies || [],
    });

    if (options.stackError) {
      mockGetUser.mockRejectedValue(options.stackError);
    } else {
      mockGetUser.mockResolvedValue(options.stackUser || null);
    }

    if (options.dbError) {
      mockPrisma.user.count.mockRejectedValue(options.dbError);
    } else {
      mockPrisma.user.count.mockResolvedValue(options.dbUserCount ?? 0);
      mockPrisma.profile.count.mockResolvedValue(options.dbProfileCount ?? 0);
    }

    if (options.currentUserError) {
      mockGetCurrentUser.mockRejectedValue(options.currentUserError);
    } else {
      mockGetCurrentUser.mockResolvedValue(options.currentUser || null);
    }
  };

  describe('GET /api/debug-auth', () => {
    it('returns debug info successfully', async () => {
      process.env.NEXT_PUBLIC_STACK_PROJECT_ID = 'test-project-id-12345';
      process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY = 'test-client-key';
      process.env.STACK_SECRET_SERVER_KEY = 'test-server-key';
      process.env.ALLOWED_EMAILS = 'test@example.com';
      process.env.DATABASE_URL = 'postgresql://user@localhost:5432/test';

      setupMocks({
        cookies: [],
        stackUser: null,
        dbUserCount: 5,
        dbProfileCount: 3,
        currentUser: null,
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.timestamp).toBeDefined();
      expect(data.envCheck).toBeDefined();
      expect(data.cookies).toBeDefined();
      expect(data.database).toBeDefined();
      expect(data.database.connected).toBe(true);
      expect(data.database.userCount).toBe(5);
      expect(data.database.profileCount).toBe(3);
    });

    it('handles authenticated Stack user', async () => {
      setupMocks({
        cookies: [{ name: 'stack-session', value: 'test-session-token-abc123' }],
        stackUser: {
          id: 'user-123',
          primaryEmail: 'test@example.com',
          displayName: 'Test User',
        },
        dbUserCount: 1,
        currentUser: { id: 'user-123' },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.stackUser).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
      });
      expect(data.isAuthenticated).toBe(true);
    });

    it('handles Stack auth error', async () => {
      setupMocks({
        cookies: [],
        stackError: new Error('Stack auth failed'),
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.stackUser).toBeNull();
      expect(data.stackError).toContain('Stack auth failed');
      expect(data.isAuthenticated).toBe(false);
    });

    it('handles database connection error', async () => {
      setupMocks({
        cookies: [],
        dbError: new Error('Connection terminated'),
      });

      const response = await GET();
      const data = await response.json();

      expect(data.database).toBeNull();
      expect(data.dbError).toContain('Connection terminated');
    });

    it('handles getCurrentUser error', async () => {
      setupMocks({
        cookies: [],
        dbUserCount: 0,
        currentUserError: new Error('getCurrentUser failed'),
      });

      const response = await GET();
      const data = await response.json();

      expect(data.currentUser).toBeNull();
      expect(data.currentUserError).toContain('getCurrentUser failed');
    });

    it('parses Neon database URL correctly', async () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-xxx.neon.tech/dbname';

      setupMocks({
        cookies: [],
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.envCheck.isNeonDatabase).toBe(true);
      expect(data.envCheck.databaseHost).toBe('ep-xxx.neon.tech');
    });

    it('handles missing DATABASE_URL', async () => {
      delete process.env.DATABASE_URL;

      setupMocks({
        cookies: [],
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.envCheck.hasDatabaseUrl).toBe(false);
      expect(data.envCheck.databaseHost).toBe('(not set)');
    });

    it('filters stack cookies from all cookies', async () => {
      setupMocks({
        cookies: [
          { name: 'stack-session', value: 'session-token-abc' },
          { name: 'stack-refresh', value: 'refresh-token-xyz' },
          { name: 'other-cookie', value: 'other-value' },
        ],
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.cookies.total).toBe(3);
      expect(data.cookies.stackCookies).toHaveLength(2);
      expect(data.cookies.stackCookies[0].name).toBe('stack-session');
    });

    it('handles ErrorEvent-like objects', async () => {
      const errorEvent = {
        type: 'error',
        message: 'ErrorEvent message',
        error: new Error('inner error'),
        constructor: { name: 'ErrorEvent' },
      };

      setupMocks({
        cookies: [],
        stackError: errorEvent as unknown as Error,
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.stackError).toContain('ErrorEvent');
    });

    it('handles primitive error values', async () => {
      setupMocks({
        cookies: [],
        stackError: 'string error' as unknown as Error,
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.stackError).toBe('string error');
    });

    it('handles top-level exception', async () => {
      mockCookies.mockRejectedValue(new Error('Cookies service down'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Cookies service down');
    });

    it('handles object error without message property', async () => {
      setupMocks({
        cookies: [],
        stackError: { type: 'custom', code: 500 } as unknown as Error,
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.stackError).toBeDefined();
    });

    it('shows Vercel environment info when available', async () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_REGION = 'iad1';

      setupMocks({
        cookies: [],
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.envCheck.vercelEnv).toBe('preview');
      expect(data.envCheck.vercelRegion).toBe('iad1');
    });

    it('shows default values when Vercel env not set', async () => {
      delete process.env.VERCEL_ENV;
      delete process.env.VERCEL_REGION;

      setupMocks({
        cookies: [],
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      expect(data.envCheck.vercelEnv).toBe('(not on vercel)');
      expect(data.envCheck.vercelRegion).toBe('(not set)');
    });

    it('handles URL parsing error gracefully', async () => {
      // Set invalid URL that might cause parsing issues
      process.env.DATABASE_URL = 'not-a-valid-url';

      setupMocks({
        cookies: [],
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      // Should not crash, and should return some fallback
      expect(data.envCheck.databaseHost).toBeDefined();
    });

    it('truncates long error stacks', async () => {
      const errorWithLongStack = new Error('Test error');
      errorWithLongStack.stack = Array(20)
        .fill(0)
        .map((_, i) => `    at function${i}`)
        .join('\n');

      setupMocks({
        cookies: [],
        stackError: errorWithLongStack,
        dbUserCount: 0,
      });

      const response = await GET();
      const data = await response.json();

      const parsed = JSON.parse(data.stackError);
      const stackLines = parsed.stack.split('\n');
      expect(stackLines.length).toBeLessThanOrEqual(5);
    });
  });
});
