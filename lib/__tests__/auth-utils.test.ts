/**
 * Unit tests for auth-utils.ts
 * Verifies authentication bypass security fix:
 * - SKIP_AUTH should ONLY work when NODE_ENV is NOT 'production'
 * - Dev user caching prevents repeated DB calls
 * - getCurrentUser returns correct user object
 */

// Store original env values
const originalNodeEnv = process.env.NODE_ENV;
const originalSkipAuth = process.env.SKIP_AUTH;

// Mock auth module factory - will be used by dynamic imports
const mockAuth = jest.fn();
const mockUpsert = jest.fn();

// Setup mocks that will be used by all dynamic imports
jest.mock('@/lib/auth', () => ({
  auth: mockAuth,
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      upsert: mockUpsert,
    },
  },
}));

// Helper to safely set NODE_ENV (it's read-only in some environments)
function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('Auth Utils', () => {
  beforeEach(() => {
    // Reset mocks
    mockAuth.mockReset();
    mockUpsert.mockReset();
    // Reset module cache to get fresh devUserCreated state
    jest.resetModules();
    // Reset environment
    setNodeEnv(originalNodeEnv || 'test');
    delete process.env.SKIP_AUTH;
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv || 'test');
    if (originalSkipAuth !== undefined) {
      process.env.SKIP_AUTH = originalSkipAuth;
    } else {
      delete process.env.SKIP_AUTH;
    }
  });

  describe('isAuthBypassed / isDevAuthMode', () => {
    describe('Security: SKIP_AUTH should NOT work in production', () => {
      it('should NOT bypass auth in production even when SKIP_AUTH=true', async () => {
        setNodeEnv('production');
        process.env.SKIP_AUTH = 'true';

        // Re-import to get fresh module state with current env
        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });

      it('should NOT bypass auth in production with any SKIP_AUTH value', async () => {
        setNodeEnv('production');
        process.env.SKIP_AUTH = 'TRUE'; // uppercase

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });
    });

    describe('Development mode bypass', () => {
      it('should bypass auth when SKIP_AUTH=true and NODE_ENV=development', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'true';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(true);
      });

      it('should bypass auth when SKIP_AUTH=true and NODE_ENV=test', async () => {
        setNodeEnv('test');
        process.env.SKIP_AUTH = 'true';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(true);
      });

      it('should NOT bypass auth when SKIP_AUTH is not exactly "true"', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'yes';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });

      it('should NOT bypass auth when SKIP_AUTH is undefined', async () => {
        setNodeEnv('development');
        delete process.env.SKIP_AUTH;

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });

      it('should NOT bypass auth when SKIP_AUTH is empty string', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = '';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });

      it('should NOT bypass auth when SKIP_AUTH=false', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'false';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });
    });
  });

  describe('getCurrentUser', () => {
    describe('With auth bypass enabled (development mode)', () => {
      it('should return dev user when bypass is enabled', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'true';

        mockUpsert.mockResolvedValueOnce({
          id: 'dev-user-local',
          email: 'dev@localhost',
          name: 'Dev User',
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toEqual({
          id: 'dev-user-local',
          email: 'dev@localhost',
          name: 'Dev User',
        });
      });

      it('should create dev user in database on first call', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'true';

        mockUpsert.mockResolvedValueOnce({});

        const { getCurrentUser } = await import('../auth-utils');
        await getCurrentUser();

        expect(mockUpsert).toHaveBeenCalledWith({
          where: { id: 'dev-user-local' },
          update: {},
          create: {
            id: 'dev-user-local',
            email: 'dev@localhost',
            name: 'Dev User',
          },
        });
      });

      it('should NOT make additional DB calls after first getCurrentUser call (caching)', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'true';

        mockUpsert.mockResolvedValue({});

        // Fresh import to reset devUserCreated flag
        const { getCurrentUser } = await import('../auth-utils');

        // First call - should create user
        await getCurrentUser();
        expect(mockUpsert).toHaveBeenCalledTimes(1);

        // Second call - should NOT call upsert again (cached)
        await getCurrentUser();
        expect(mockUpsert).toHaveBeenCalledTimes(1);

        // Third call - still no additional DB calls
        await getCurrentUser();
        expect(mockUpsert).toHaveBeenCalledTimes(1);
      });

      it('should NOT call auth() when bypass is enabled', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'true';

        mockUpsert.mockResolvedValueOnce({});

        const { getCurrentUser } = await import('../auth-utils');
        await getCurrentUser();

        expect(mockAuth).not.toHaveBeenCalled();
      });
    });

    describe('Without auth bypass (production mode)', () => {
      it('should return authenticated user from session', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockAuth.mockResolvedValueOnce({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
          },
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toEqual({
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        });
        expect(mockAuth).toHaveBeenCalled();
      });

      it('should return null when no session exists', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockAuth.mockResolvedValueOnce(null);

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toBeNull();
      });

      it('should return null when session has no user', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockAuth.mockResolvedValueOnce({});

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toBeNull();
      });

      it('should return null when user has no id', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockAuth.mockResolvedValueOnce({
          user: {
            email: 'test@example.com',
            name: 'Test User',
            // no id
          },
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toBeNull();
      });

      it('should handle null email gracefully', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockAuth.mockResolvedValueOnce({
          user: {
            id: 'user-456',
            email: null,
            name: 'Anonymous User',
          },
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toEqual({
          id: 'user-456',
          email: null,
          name: 'Anonymous User',
        });
      });

      it('should handle undefined name gracefully', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockAuth.mockResolvedValueOnce({
          user: {
            id: 'user-789',
            email: 'test@example.com',
            name: undefined,
          },
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toEqual({
          id: 'user-789',
          email: 'test@example.com',
          name: null,
        });
      });

      it('should NOT call prisma.user.upsert in production', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockAuth.mockResolvedValueOnce({
          user: {
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
          },
        });

        const { getCurrentUser } = await import('../auth-utils');
        await getCurrentUser();

        expect(mockUpsert).not.toHaveBeenCalled();
      });
    });

    describe('Edge cases: SKIP_AUTH set but NODE_ENV is production', () => {
      it('should use proper auth even when SKIP_AUTH=true in production', async () => {
        setNodeEnv('production');
        process.env.SKIP_AUTH = 'true';

        mockAuth.mockResolvedValueOnce({
          user: {
            id: 'real-user-123',
            email: 'real@example.com',
            name: 'Real User',
          },
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        // Should use real auth, not bypass
        expect(mockAuth).toHaveBeenCalled();
        expect(mockUpsert).not.toHaveBeenCalled();
        expect(user).toEqual({
          id: 'real-user-123',
          email: 'real@example.com',
          name: 'Real User',
        });
      });

      it('should return null for unauthenticated user in production even with SKIP_AUTH=true', async () => {
        setNodeEnv('production');
        process.env.SKIP_AUTH = 'true';

        mockAuth.mockResolvedValueOnce(null);

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toBeNull();
        expect(mockAuth).toHaveBeenCalled();
      });
    });
  });

  describe('CurrentUser interface', () => {
    it('should return object matching CurrentUser interface', async () => {
      setNodeEnv('production');
      delete process.env.SKIP_AUTH;

      mockAuth.mockResolvedValueOnce({
        user: {
          id: 'interface-test-user',
          email: 'interface@test.com',
          name: 'Interface Test',
          image: 'https://example.com/image.png', // extra field should not be included
        },
      });

      const { getCurrentUser } = await import('../auth-utils');
      const user = await getCurrentUser();

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      // image should NOT be in the returned object
      expect(user).not.toHaveProperty('image');
    });
  });
});

describe('Security Verification Summary', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockUpsert.mockReset();
    jest.resetModules();
    setNodeEnv(originalNodeEnv || 'test');
    delete process.env.SKIP_AUTH;
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv || 'test');
    if (originalSkipAuth !== undefined) {
      process.env.SKIP_AUTH = originalSkipAuth;
    } else {
      delete process.env.SKIP_AUTH;
    }
  });

  it('CRITICAL: Auth bypass is impossible in production', async () => {
    // This test documents the security requirement
    setNodeEnv('production');
    process.env.SKIP_AUTH = 'true';

    const { isDevAuthMode, getCurrentUser } = await import('../auth-utils');

    // Verify bypass is blocked
    expect(isDevAuthMode()).toBe(false);

    // Verify real auth is called
    mockAuth.mockResolvedValueOnce(null);
    const user = await getCurrentUser();

    expect(mockAuth).toHaveBeenCalled();
    expect(user).toBeNull(); // No bypass, no user
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('CRITICAL: Auth bypass only works in non-production environments', async () => {
    // Test development
    setNodeEnv('development');
    process.env.SKIP_AUTH = 'true';

    const devModule = await import('../auth-utils');
    expect(devModule.isDevAuthMode()).toBe(true);

    // Reset for test environment
    jest.resetModules();
    setNodeEnv('test');
    process.env.SKIP_AUTH = 'true';

    const testModule = await import('../auth-utils');
    expect(testModule.isDevAuthMode()).toBe(true);

    // Reset for production (should be blocked)
    jest.resetModules();
    setNodeEnv('production');
    process.env.SKIP_AUTH = 'true';

    const prodModule = await import('../auth-utils');
    expect(prodModule.isDevAuthMode()).toBe(false);
  });

  it('CRITICAL: isAuthBypassed requires both SKIP_AUTH=true AND non-production environment', async () => {
    // Case 1: production + SKIP_AUTH=true -> blocked
    setNodeEnv('production');
    process.env.SKIP_AUTH = 'true';
    let mod = await import('../auth-utils');
    expect(mod.isDevAuthMode()).toBe(false);

    // Case 2: production + SKIP_AUTH=false -> blocked
    jest.resetModules();
    setNodeEnv('production');
    process.env.SKIP_AUTH = 'false';
    mod = await import('../auth-utils');
    expect(mod.isDevAuthMode()).toBe(false);

    // Case 3: development + SKIP_AUTH=false -> blocked
    jest.resetModules();
    setNodeEnv('development');
    process.env.SKIP_AUTH = 'false';
    mod = await import('../auth-utils');
    expect(mod.isDevAuthMode()).toBe(false);

    // Case 4: development + SKIP_AUTH=true -> allowed
    jest.resetModules();
    setNodeEnv('development');
    process.env.SKIP_AUTH = 'true';
    mod = await import('../auth-utils');
    expect(mod.isDevAuthMode()).toBe(true);
  });
});
