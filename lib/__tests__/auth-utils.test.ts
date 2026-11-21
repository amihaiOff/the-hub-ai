/**
 * Unit tests for auth-utils.ts
 * Verifies authentication bypass security fix:
 * - SKIP_AUTH works in local dev and on Vercel preview, never in real production
 * - Dev user caching prevents repeated DB calls
 * - getCurrentUser returns correct user object
 * - getCurrentContext returns profile and household data
 * - getAccessibleProfileIds returns correct profile IDs
 * - isHouseholdAdmin checks role correctly
 */

// Store original env values
const originalNodeEnv = process.env.NODE_ENV;
const originalSkipAuth = process.env.SKIP_AUTH;
const originalVercelEnv = process.env.VERCEL_ENV;

// Mock Stack Auth server app - will be used by dynamic imports
const mockGetUser = jest.fn();
const mockUpsert = jest.fn();
const mockProfileFindUnique = jest.fn();
const mockHouseholdMemberFindMany = jest.fn();
// The section guard in getCurrentUser also calls householdMember.findMany
// (with `select: { allowedSections }`). Route that call to its own mock so the
// existing getCurrentContext tests keep their mockResolvedValueOnce ordering.
const mockSectionMembershipsFindMany = jest.fn();
const mockUserFindFirst = jest.fn();
const mockInviteFindFirst = jest.fn();
const mockHeadersGet = jest.fn();
const mockHeaders = jest.fn();

jest.mock('next/headers', () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}));

function resetSectionMocks() {
  mockSectionMembershipsFindMany.mockReset();
  mockSectionMembershipsFindMany.mockResolvedValue([]); // no membership = unrestricted
  mockUserFindFirst.mockReset();
  mockUserFindFirst.mockResolvedValue(null);
  mockInviteFindFirst.mockReset();
  mockInviteFindFirst.mockResolvedValue(null);
  mockHeadersGet.mockReset();
  mockHeadersGet.mockReturnValue(null);
  mockHeaders.mockReset();
  mockHeaders.mockResolvedValue({ get: mockHeadersGet });
}
resetSectionMocks();

// Setup mocks that will be used by all dynamic imports
jest.mock('@/stack/server', () => ({
  stackServerApp: {
    getUser: mockGetUser,
  },
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      upsert: mockUpsert,
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    profile: {
      findUnique: mockProfileFindUnique,
    },
    householdMember: {
      findMany: (args: { select?: { allowedSections?: boolean } }) =>
        args?.select?.allowedSections
          ? mockSectionMembershipsFindMany(args)
          : mockHouseholdMemberFindMany(args),
    },
    householdInvite: {
      findFirst: (...args: unknown[]) => mockInviteFindFirst(...args),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
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
    mockGetUser.mockReset();
    mockUpsert.mockReset();
    resetSectionMocks();
    mockProfileFindUnique.mockReset();
    mockHouseholdMemberFindMany.mockReset();
    // Reset module cache to get fresh devUserCreated state
    jest.resetModules();
    // Reset environment
    setNodeEnv(originalNodeEnv || 'test');
    delete process.env.SKIP_AUTH;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv || 'test');
    if (originalSkipAuth !== undefined) {
      process.env.SKIP_AUTH = originalSkipAuth;
    } else {
      delete process.env.SKIP_AUTH;
    }
    if (originalVercelEnv !== undefined) {
      process.env.VERCEL_ENV = originalVercelEnv;
    } else {
      delete process.env.VERCEL_ENV;
    }
  });

  describe('isAuthBypassed / isDevAuthMode', () => {
    describe('Production refuses the bypass even when SKIP_AUTH is set', () => {
      // Vercel builds BOTH preview and production with NODE_ENV=production, so
      // VERCEL_ENV is the only reliable discriminator between them.
      it('should NOT bypass auth on Vercel production', async () => {
        setNodeEnv('production');
        process.env.VERCEL_ENV = 'production';
        process.env.SKIP_AUTH = 'true';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });

      it('should NOT bypass auth when on Vercel but VERCEL_ENV is absent', async () => {
        // An unidentifiable Vercel deployment is refused rather than trusted:
        // happens if the project stops exposing system env vars.
        setNodeEnv('production');
        process.env.VERCEL = '1';
        process.env.SKIP_AUTH = 'true';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });

      it('should NOT bypass auth on Vercel production even in a dev NODE_ENV', async () => {
        setNodeEnv('development');
        process.env.VERCEL_ENV = 'production';
        process.env.SKIP_AUTH = 'true';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });

      it('should NOT bypass auth when SKIP_AUTH is uppercase TRUE', async () => {
        setNodeEnv('production');
        process.env.SKIP_AUTH = 'TRUE'; // must be exact lowercase 'true'

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(false);
      });
    });

    describe('Local machine bypass', () => {
      it('should bypass auth on a local production build (no VERCEL at all)', async () => {
        // `npm run build && npm start` for perf measurement — see docs/perf.md.
        setNodeEnv('production');
        process.env.SKIP_AUTH = 'true';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(true);
      });
    });

    describe('Vercel preview bypass (deliberate)', () => {
      it('should bypass auth on preview when SKIP_AUTH=true', async () => {
        setNodeEnv('production');
        process.env.VERCEL = '1';
        process.env.VERCEL_ENV = 'preview';
        process.env.SKIP_AUTH = 'true';

        const { isDevAuthMode } = await import('../auth-utils');

        expect(isDevAuthMode()).toBe(true);
      });

      it('should NOT bypass auth on preview when SKIP_AUTH is unset', async () => {
        // Unsetting SKIP_AUTH in the preview env is how you make preview
        // behave like production (e.g. to exercise the scoped agent tokens,
        // whose code path a live session short-circuits).
        setNodeEnv('production');
        process.env.VERCEL_ENV = 'preview';
        delete process.env.SKIP_AUTH;

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

      it('should NOT call stackServerApp.getUser() when bypass is enabled', async () => {
        setNodeEnv('development');
        process.env.SKIP_AUTH = 'true';

        mockUpsert.mockResolvedValueOnce({});

        const { getCurrentUser } = await import('../auth-utils');
        await getCurrentUser();

        expect(mockGetUser).not.toHaveBeenCalled();
      });
    });

    describe('Without auth bypass (production mode)', () => {
      it('should return authenticated user from Stack Auth', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        // Stack Auth returns user object directly
        mockGetUser.mockResolvedValueOnce({
          primaryEmail: 'test@example.com',
          displayName: 'Test User',
        });

        // Mock the database upsert (Stack Auth flow upserts user)
        mockUpsert.mockResolvedValueOnce({
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toEqual({
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        });
        expect(mockGetUser).toHaveBeenCalled();
      });

      it('should return null when no user from Stack Auth', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockGetUser.mockResolvedValueOnce(null);

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toBeNull();
      });

      it('should return null when user has no email', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockGetUser.mockResolvedValueOnce({
          primaryEmail: null,
          displayName: 'Test User',
        });

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        expect(user).toBeNull();
      });

      it('should upsert user in database when authenticated', async () => {
        setNodeEnv('production');
        delete process.env.SKIP_AUTH;

        mockGetUser.mockResolvedValueOnce({
          primaryEmail: 'test@example.com',
          displayName: 'Test User',
        });

        mockUpsert.mockResolvedValueOnce({
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        });

        const { getCurrentUser } = await import('../auth-utils');
        await getCurrentUser();

        expect(mockUpsert).toHaveBeenCalledWith({
          where: { email: 'test@example.com' },
          update: { name: 'Test User' },
          create: { email: 'test@example.com', name: 'Test User' },
        });
      });
    });

    describe('SKIP_AUTH=true bypasses auth in dev and on preview', () => {
      it('should bypass auth and return dev user on a preview deployment', async () => {
        process.env.VERCEL_ENV = 'preview';
        setNodeEnv('production');
        process.env.SKIP_AUTH = 'true';

        const { getCurrentUser } = await import('../auth-utils');
        const user = await getCurrentUser();

        // Should use bypass, not Stack Auth
        expect(mockGetUser).not.toHaveBeenCalled();
        expect(user?.email).toBe('dev@localhost');
      });
    });
  });

  describe('CurrentUser interface', () => {
    it('should return object matching CurrentUser interface', async () => {
      setNodeEnv('production');
      delete process.env.SKIP_AUTH;

      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'interface@test.com',
        displayName: 'Interface Test',
        profileImageUrl: 'https://example.com/image.png', // extra field should not be included
      });

      mockUpsert.mockResolvedValueOnce({
        id: 'interface-test-user',
        email: 'interface@test.com',
        name: 'Interface Test',
      });

      const { getCurrentUser } = await import('../auth-utils');
      const user = await getCurrentUser();

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      // image should NOT be in the returned object
      expect(user).not.toHaveProperty('image');
      expect(user).not.toHaveProperty('profileImageUrl');
    });
  });
});

describe('Security Verification Summary', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpsert.mockReset();
    resetSectionMocks();
    jest.resetModules();
    setNodeEnv(originalNodeEnv || 'test');
    delete process.env.SKIP_AUTH;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv || 'test');
    if (originalSkipAuth !== undefined) {
      process.env.SKIP_AUTH = originalSkipAuth;
    } else {
      delete process.env.SKIP_AUTH;
    }
    if (originalVercelEnv !== undefined) {
      process.env.VERCEL_ENV = originalVercelEnv;
    } else {
      delete process.env.VERCEL_ENV;
    }
  });

  it('Auth bypass works on preview deployments (NODE_ENV=production there)', async () => {
    process.env.VERCEL_ENV = 'preview';
    setNodeEnv('production');
    process.env.SKIP_AUTH = 'true';

    const { isDevAuthMode, getCurrentUser } = await import('../auth-utils');

    expect(isDevAuthMode()).toBe(true);

    const user = await getCurrentUser();

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(user?.email).toBe('dev@localhost');
  });

  it('CRITICAL: Auth bypass never works in real production', async () => {
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

    // Reset for preview — SKIP_AUTH=true bypasses (NODE_ENV is production there)
    jest.resetModules();
    setNodeEnv('production');
    process.env.VERCEL_ENV = 'preview';
    process.env.SKIP_AUTH = 'true';

    const previewModule = await import('../auth-utils');
    expect(previewModule.isDevAuthMode()).toBe(true);

    // Reset for real production — SKIP_AUTH is ignored, as CLAUDE.md promises
    jest.resetModules();
    setNodeEnv('production');
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.SKIP_AUTH = 'true';

    const prodModule = await import('../auth-utils');
    expect(prodModule.isDevAuthMode()).toBe(false);
  });

  it('isAuthBypassed requires SKIP_AUTH=true AND a non-production environment', async () => {
    // Case 1: production + SKIP_AUTH=true -> STILL blocked
    setNodeEnv('production');
    process.env.VERCEL_ENV = 'production';
    process.env.SKIP_AUTH = 'true';
    let mod = await import('../auth-utils');
    expect(mod.isDevAuthMode()).toBe(false);

    // Case 1b: preview + SKIP_AUTH=true -> bypassed
    jest.resetModules();
    setNodeEnv('production');
    process.env.VERCEL_ENV = 'preview';
    process.env.SKIP_AUTH = 'true';
    mod = await import('../auth-utils');
    expect(mod.isDevAuthMode()).toBe(true);

    // Case 2: production + SKIP_AUTH=false -> blocked
    jest.resetModules();
    delete process.env.VERCEL_ENV;
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

describe('Profile/Household Context', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpsert.mockReset();
    resetSectionMocks();
    mockProfileFindUnique.mockReset();
    mockHouseholdMemberFindMany.mockReset();
    jest.resetModules();
    setNodeEnv(originalNodeEnv || 'test');
    delete process.env.SKIP_AUTH;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv || 'test');
    if (originalSkipAuth !== undefined) {
      process.env.SKIP_AUTH = originalSkipAuth;
    } else {
      delete process.env.SKIP_AUTH;
    }
    if (originalVercelEnv !== undefined) {
      process.env.VERCEL_ENV = originalVercelEnv;
    } else {
      delete process.env.VERCEL_ENV;
    }
  });

  // Sample test data
  const mockProfile = {
    id: 'profile-1',
    name: 'Test User',
    image: 'https://example.com/avatar.png',
    color: '#3b82f6',
    userId: 'user-123',
    householdMemberships: [
      {
        id: 'member-1',
        householdId: 'household-1',
        profileId: 'profile-1',
        role: 'owner',
        household: {
          id: 'household-1',
          name: "Test User's Household",
          description: null,
        },
      },
    ],
  };

  const mockHouseholdMembers = [
    {
      id: 'member-1',
      householdId: 'household-1',
      profileId: 'profile-1',
      role: 'owner',
      profile: {
        id: 'profile-1',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        color: '#3b82f6',
        userId: 'user-123',
      },
    },
    {
      id: 'member-2',
      householdId: 'household-1',
      profileId: 'profile-2',
      role: 'member',
      profile: {
        id: 'profile-2',
        name: 'Family Member',
        image: null,
        color: '#10b981',
        userId: null, // Non-login profile
      },
    },
  ];

  describe('getCurrentContext', () => {
    it('should return null when user is not authenticated', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce(null);

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext();

      expect(context).toBeNull();
    });

    it('should return null when user has no profile (needs onboarding)', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'test@example.com',
        displayName: 'Test',
      });
      mockUpsert.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test',
      });
      mockProfileFindUnique.mockResolvedValueOnce(null);

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext();

      expect(context).toBeNull();
    });

    it('should return null when user has profile but no households', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'test@example.com',
        displayName: 'Test',
      });
      mockUpsert.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test',
      });
      mockProfileFindUnique.mockResolvedValueOnce({
        ...mockProfile,
        householdMemberships: [], // No households
      });

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext();

      expect(context).toBeNull();
    });

    it('should return full context with profile, households, and household profiles', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'test@example.com',
        displayName: 'Test User',
      });
      mockUpsert.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      });
      mockProfileFindUnique.mockResolvedValueOnce(mockProfile);
      mockHouseholdMemberFindMany.mockResolvedValueOnce(mockHouseholdMembers);

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext();

      expect(context).not.toBeNull();
      expect(context?.user.id).toBe('user-123');
      expect(context?.profile.id).toBe('profile-1');
      expect(context?.profile.name).toBe('Test User');
      expect(context?.households).toHaveLength(1);
      expect(context?.activeHousehold.id).toBe('household-1');
      expect(context?.activeHousehold.role).toBe('owner');
      expect(context?.householdProfiles).toHaveLength(2);
    });

    it('should use specified householdId as active household', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'test@example.com',
        displayName: 'Test',
      });
      mockUpsert.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test',
      });

      const multiHouseholdProfile = {
        ...mockProfile,
        householdMemberships: [
          ...mockProfile.householdMemberships,
          {
            id: 'member-3',
            householdId: 'household-2',
            profileId: 'profile-1',
            role: 'member',
            household: {
              id: 'household-2',
              name: 'Second Household',
              description: 'Another household',
            },
          },
        ],
      };

      mockProfileFindUnique.mockResolvedValueOnce(multiHouseholdProfile);
      mockHouseholdMemberFindMany.mockResolvedValueOnce([
        {
          id: 'member-3',
          householdId: 'household-2',
          profileId: 'profile-1',
          role: 'member',
          profile: {
            id: 'profile-1',
            name: 'Test User',
            image: null,
            color: '#3b82f6',
            userId: 'user-123',
          },
        },
      ]);

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext('household-2');

      expect(context?.activeHousehold.id).toBe('household-2');
      expect(context?.activeHousehold.name).toBe('Second Household');
    });

    it('should default to first household if specified householdId not found', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'test@example.com',
        displayName: 'Test',
      });
      mockUpsert.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test',
      });
      mockProfileFindUnique.mockResolvedValueOnce(mockProfile);
      mockHouseholdMemberFindMany.mockResolvedValueOnce(mockHouseholdMembers);

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext('non-existent-household');

      // Should fall back to first household
      expect(context?.activeHousehold.id).toBe('household-1');
    });

    it('should correctly identify profiles with and without linked users', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'test@example.com',
        displayName: 'Test',
      });
      mockUpsert.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test',
      });
      mockProfileFindUnique.mockResolvedValueOnce(mockProfile);
      mockHouseholdMemberFindMany.mockResolvedValueOnce(mockHouseholdMembers);

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext();

      const ownerProfile = context?.householdProfiles.find((p) => p.id === 'profile-1');
      const memberProfile = context?.householdProfiles.find((p) => p.id === 'profile-2');

      expect(ownerProfile?.hasUser).toBe(true);
      expect(memberProfile?.hasUser).toBe(false);
    });
  });

  describe('getAccessibleProfileIds', () => {
    it('should return all profile IDs in the household', async () => {
      setNodeEnv('production');
      mockGetUser.mockResolvedValueOnce({
        primaryEmail: 'test@example.com',
        displayName: 'Test',
      });
      mockUpsert.mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test',
      });
      mockProfileFindUnique.mockResolvedValueOnce(mockProfile);
      mockHouseholdMemberFindMany.mockResolvedValueOnce(mockHouseholdMembers);

      const { getCurrentContext, getAccessibleProfileIds } = await import('../auth-utils');
      const context = await getCurrentContext();

      expect(context).not.toBeNull();
      const profileIds = getAccessibleProfileIds(context!);

      expect(profileIds).toHaveLength(2);
      expect(profileIds).toContain('profile-1');
      expect(profileIds).toContain('profile-2');
    });

    it('should return empty array for household with no profiles', async () => {
      const { getAccessibleProfileIds } = await import('../auth-utils');

      const emptyContext = {
        user: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        profile: { id: 'profile-1', name: 'Test', image: null, color: null, userId: 'user-123' },
        households: [
          { id: 'household-1', name: 'Test', description: null, role: 'owner' as const },
        ],
        activeHousehold: {
          id: 'household-1',
          name: 'Test',
          description: null,
          role: 'owner' as const,
        },
        householdProfiles: [],
      };

      const profileIds = getAccessibleProfileIds(emptyContext);
      expect(profileIds).toHaveLength(0);
    });
  });

  describe('isHouseholdAdmin', () => {
    it('should return true for owner role', async () => {
      const { isHouseholdAdmin } = await import('../auth-utils');

      const ownerContext = {
        user: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        profile: { id: 'profile-1', name: 'Test', image: null, color: null, userId: 'user-123' },
        households: [
          { id: 'household-1', name: 'Test', description: null, role: 'owner' as const },
        ],
        activeHousehold: {
          id: 'household-1',
          name: 'Test',
          description: null,
          role: 'owner' as const,
        },
        householdProfiles: [],
      };

      expect(isHouseholdAdmin(ownerContext)).toBe(true);
    });

    it('should return true for admin role', async () => {
      const { isHouseholdAdmin } = await import('../auth-utils');

      const adminContext = {
        user: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        profile: { id: 'profile-1', name: 'Test', image: null, color: null, userId: 'user-123' },
        households: [
          { id: 'household-1', name: 'Test', description: null, role: 'admin' as const },
        ],
        activeHousehold: {
          id: 'household-1',
          name: 'Test',
          description: null,
          role: 'admin' as const,
        },
        householdProfiles: [],
      };

      expect(isHouseholdAdmin(adminContext)).toBe(true);
    });

    it('should return false for member role', async () => {
      const { isHouseholdAdmin } = await import('../auth-utils');

      const memberContext = {
        user: { id: 'user-123', email: 'test@example.com', name: 'Test' },
        profile: { id: 'profile-1', name: 'Test', image: null, color: null, userId: 'user-123' },
        households: [
          { id: 'household-1', name: 'Test', description: null, role: 'member' as const },
        ],
        activeHousehold: {
          id: 'household-1',
          name: 'Test',
          description: null,
          role: 'member' as const,
        },
        householdProfiles: [],
      };

      expect(isHouseholdAdmin(memberContext)).toBe(false);
    });
  });

  describe('getCurrentContext with dev mode', () => {
    it('should work with dev user when auth is bypassed', async () => {
      setNodeEnv('development');
      process.env.SKIP_AUTH = 'true';

      mockUpsert.mockResolvedValueOnce({
        id: 'dev-user-local',
        email: 'dev@localhost',
        name: 'Dev User',
      });
      mockProfileFindUnique.mockResolvedValueOnce({
        id: 'dev-profile',
        name: 'Dev User',
        image: null,
        color: '#3b82f6',
        userId: 'dev-user-local',
        householdMemberships: [
          {
            id: 'dev-member',
            householdId: 'dev-household',
            profileId: 'dev-profile',
            role: 'owner',
            household: {
              id: 'dev-household',
              name: "Dev User's Household",
              description: null,
            },
          },
        ],
      });
      mockHouseholdMemberFindMany.mockResolvedValueOnce([
        {
          id: 'dev-member',
          householdId: 'dev-household',
          profileId: 'dev-profile',
          role: 'owner',
          profile: {
            id: 'dev-profile',
            name: 'Dev User',
            image: null,
            color: '#3b82f6',
            userId: 'dev-user-local',
          },
        },
      ]);

      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext();

      expect(context).not.toBeNull();
      expect(context?.user.id).toBe('dev-user-local');
      expect(context?.profile.id).toBe('dev-profile');
    });
  });
});

describe('Section restriction', () => {
  const originalAllowed = process.env.ALLOWED_EMAILS;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpsert.mockReset();
    mockProfileFindUnique.mockReset();
    mockHouseholdMemberFindMany.mockReset();
    resetSectionMocks();
    jest.resetModules();
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
    delete process.env.ALLOWED_EMAILS;
    // Dev bypass: deterministic signed-in user without Stack Auth.
    setNodeEnv('development');
    process.env.SKIP_AUTH = 'true';
    mockUpsert.mockResolvedValue({});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv || 'test');
    if (originalSkipAuth !== undefined) process.env.SKIP_AUTH = originalSkipAuth;
    else delete process.env.SKIP_AUTH;
    if (originalAllowed !== undefined) process.env.ALLOWED_EMAILS = originalAllowed;
    else delete process.env.ALLOWED_EMAILS;
  });

  function setPath(path: string | null) {
    mockHeadersGet.mockImplementation((name: string) => (name === 'x-pathname' ? path : null));
  }

  describe('getCurrentUser (most restrictive across memberships)', () => {
    it('queries the signed-in user’s memberships for allowedSections', async () => {
      const { getCurrentUser } = await import('../auth-utils');
      await getCurrentUser();

      expect(mockSectionMembershipsFindMany).toHaveBeenCalledWith({
        where: { profile: { userId: 'dev-user-local' } },
        select: { allowedSections: true },
      });
    });

    it('returns null for a restricted user on a denied x-pathname', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([{ allowedSections: ['finances'] }]);
      setPath('/api/tasks');

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toBeNull();
    });

    it('returns the user for a restricted user on an allowed x-pathname', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([{ allowedSections: ['finances'] }]);
      setPath('/api/portfolio/accounts/abc');

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toEqual({
        id: 'dev-user-local',
        email: 'dev@localhost',
        name: 'Dev User',
      });
    });

    it('allows always-allowed infrastructure paths for a restricted user', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([{ allowedSections: ['shopping'] }]);
      setPath('/api/context');

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).not.toBeNull();
    });

    it('returns null for a restricted user when the x-pathname header is missing', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([{ allowedSections: ['finances'] }]);
      setPath(null);

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toBeNull();
    });

    it('returns null for a restricted user when headers() throws (no request scope)', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([{ allowedSections: ['finances'] }]);
      mockHeaders.mockRejectedValue(new Error('outside request scope'));

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toBeNull();
    });

    it('returns the user for an unrestricted member without reading headers', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([{ allowedSections: [] }]);

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).not.toBeNull();
      expect(mockHeaders).not.toHaveBeenCalled();
    });

    it('returns the user with no membership yet (onboarding) without reading headers', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([]);

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).not.toBeNull();
      expect(mockHeaders).not.toHaveBeenCalled();
    });

    it('denies when ANY membership is restricted and disallows the path (unrestricted elsewhere)', async () => {
      // Unrestricted in their own household, limited to shopping in another.
      mockSectionMembershipsFindMany.mockResolvedValue([
        { allowedSections: [] },
        { allowedSections: ['shopping'] },
      ]);
      setPath('/api/tasks');

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toBeNull();
    });

    it('allows a path permitted by EVERY membership', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([
        { allowedSections: [] },
        { allowedSections: ['shopping'] },
      ]);
      setPath('/api/shopping/items');

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).not.toBeNull();
    });

    it('does not union two restricted memberships', async () => {
      mockSectionMembershipsFindMany.mockResolvedValue([
        { allowedSections: ['finances'] },
        { allowedSections: ['shopping'] },
      ]);
      setPath('/api/shopping');

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toBeNull();
    });
  });

  describe('getCurrentContext (active household decides)', () => {
    // Own household (unrestricted) + a second household limited to shopping.
    const profile = {
      id: 'p1',
      name: 'Dev',
      image: null,
      color: null,
      userId: 'dev-user-local',
      householdMemberships: [
        {
          role: 'owner',
          allowedSections: [],
          household: { id: 'own', name: 'Own', description: null },
        },
        {
          role: 'member',
          allowedSections: ['shopping'],
          household: { id: 'shared', name: 'Shared', description: null },
        },
      ],
    };

    beforeEach(() => {
      mockProfileFindUnique.mockResolvedValue(profile);
      mockHouseholdMemberFindMany.mockResolvedValue([]);
    });

    it('does not run the cross-membership getCurrentUser check', async () => {
      setPath('/api/tasks');
      const { getCurrentContext } = await import('../auth-utils');
      await getCurrentContext('own');
      expect(mockSectionMembershipsFindMany).not.toHaveBeenCalled();
    });

    it('allows /api/tasks with the unrestricted household active', async () => {
      setPath('/api/tasks');
      const { getCurrentContext } = await import('../auth-utils');
      const context = await getCurrentContext('own');
      expect(context?.activeHousehold.id).toBe('own');
      expect(context?.activeHousehold.allowedSections).toEqual([]);
      expect(context?.households.map((h) => h.allowedSections)).toEqual([[], ['shopping']]);
    });

    it('denies /api/tasks with the restricted household active', async () => {
      setPath('/api/tasks');
      const { getCurrentContext } = await import('../auth-utils');
      expect(await getCurrentContext('shared')).toBeNull();
      expect(mockHouseholdMemberFindMany).not.toHaveBeenCalled();
    });

    it('allows an in-section path with the restricted household active', async () => {
      setPath('/api/shopping/items');
      const { getCurrentContext } = await import('../auth-utils');
      expect((await getCurrentContext('shared'))?.activeHousehold.id).toBe('shared');
    });

    it('denies the restricted household when x-pathname is missing', async () => {
      setPath(null);
      const { getCurrentContext } = await import('../auth-utils');
      expect(await getCurrentContext('shared')).toBeNull();
    });

    it('does not read headers when the active household is unrestricted', async () => {
      const { getCurrentContext } = await import('../auth-utils');
      expect(await getCurrentContext('own')).not.toBeNull();
      expect(mockHeaders).not.toHaveBeenCalled();
    });
  });

  describe('allowlist grant via invite (pending or accepted + still a member)', () => {
    beforeEach(() => {
      setNodeEnv('production');
      delete process.env.SKIP_AUTH;
      process.env.ALLOWED_EMAILS = 'owner@example.com';
      mockGetUser.mockResolvedValue({ primaryEmail: 'Member@Example.com', displayName: 'M' });
      mockUpsert.mockResolvedValue({ id: 'user-m', email: 'member@example.com', name: 'M' });
    });

    it('denies a non-allowlisted email with no matching invite', async () => {
      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toBeNull();
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('admits a non-allowlisted email once its invite was accepted and they remain a member', async () => {
      // The query's accepted-invite branch matched.
      mockInviteFindFirst.mockResolvedValue({ id: 'inv-accepted' });

      const { getCurrentUser } = await import('../auth-utils');
      expect(await getCurrentUser()).toEqual({
        id: 'user-m',
        email: 'member@example.com',
        name: 'M',
      });
    });

    it('hasInviteOrMembership issues one invite query covering pending and accepted-and-still-member', async () => {
      const { hasInviteOrMembership } = await import('../auth-utils');

      expect(await hasInviteOrMembership('  Member@Example.com ')).toBe(false);
      expect(mockInviteFindFirst).toHaveBeenCalledTimes(1);
      expect(mockUserFindFirst).not.toHaveBeenCalled();

      const { where } = mockInviteFindFirst.mock.calls[0][0];
      expect(where.email).toBe('member@example.com');
      expect(where.OR).toEqual([
        { acceptedAt: null, expiresAt: { gt: expect.any(Date) } },
        {
          acceptedAt: { not: null },
          household: {
            members: {
              some: {
                profile: {
                  user: { email: { equals: 'member@example.com', mode: 'insensitive' } },
                },
              },
            },
          },
        },
      ]);
      // Pending branch must only accept unexpired invites.
      expect(where.OR[0].expiresAt.gt.getTime()).toBeGreaterThan(Date.now() - 5000);

      mockInviteFindFirst.mockResolvedValueOnce({ id: 'inv-1' });
      expect(await hasInviteOrMembership('member@example.com')).toBe(true);
    });

    it('gives a self-onboarded user (membership, no invite) no grant', async () => {
      // They have a household of their own, but no invite row matches.
      mockUserFindFirst.mockResolvedValue({ id: 'user-m' });
      mockInviteFindFirst.mockResolvedValue(null);

      const { hasInviteOrMembership } = await import('../auth-utils');
      expect(await hasInviteOrMembership('member@example.com')).toBe(false);
    });
  });
});
