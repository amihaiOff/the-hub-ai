/**
 * Integration tests for /api/context endpoint
 * Tests the context API that returns profile, households, and household profiles
 */

import { NextRequest } from 'next/server';

// Mock the auth-utils module (must be before imports that use it)
const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: (...args: unknown[]) => mockGetCurrentContext(...args),
}));

// Import after mock setup
import { GET } from '../route';

describe('/api/context', () => {
  beforeEach(() => {
    mockGetCurrentContext.mockReset();
  });

  const mockContext = {
    user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
    profile: {
      id: 'profile-1',
      name: 'Test User',
      image: 'https://example.com/avatar.png',
      color: '#3b82f6',
      userId: 'user-123',
    },
    households: [
      {
        id: 'household-1',
        name: "Test User's Household",
        description: null,
        role: 'owner',
      },
    ],
    activeHousehold: {
      id: 'household-1',
      name: "Test User's Household",
      description: null,
      role: 'owner',
    },
    householdProfiles: [
      {
        id: 'profile-1',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        color: '#3b82f6',
        role: 'owner',
        hasUser: true,
      },
      {
        id: 'profile-2',
        name: 'Family Member',
        image: null,
        color: '#10b981',
        role: 'member',
        hasUser: false,
      },
    ],
  };

  describe('GET /api/context', () => {
    it('should return 404 when user is not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/context');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.needsOnboarding).toBe(true);
    });

    it('should return context data when user is authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/context');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.profile.id).toBe('profile-1');
      expect(data.data.households).toHaveLength(1);
      expect(data.data.activeHousehold.id).toBe('household-1');
      expect(data.data.householdProfiles).toHaveLength(2);
    });

    it('should pass householdId query parameter to getCurrentContext', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/context?householdId=household-2');
      await GET(request);

      expect(mockGetCurrentContext).toHaveBeenCalledWith('household-2');
    });

    it('should not include user data in response (only profile)', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/context');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.user).toBeUndefined();
      expect(data.data.profile).toBeDefined();
    });

    it('should return 500 on internal error', async () => {
      mockGetCurrentContext.mockRejectedValueOnce(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/context');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch context');
    });

    it('should handle empty householdId query parameter', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/context?householdId=');
      await GET(request);

      // Empty string should be converted to undefined
      expect(mockGetCurrentContext).toHaveBeenCalledWith(undefined);
    });
  });
});
