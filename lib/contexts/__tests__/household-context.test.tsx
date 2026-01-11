/**
 * Unit tests for HouseholdContext
 * Tests the client-side household context provider and hooks
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock @stackframe/stack
const mockUseUser = jest.fn();
jest.mock('@stackframe/stack', () => ({
  useUser: () => mockUseUser(),
}));

// Mock localStorage
const mockLocalStorage: { [key: string]: string } = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      mockLocalStorage[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete mockLocalStorage[key];
    }),
    clear: jest.fn(() => {
      Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);
    }),
  },
  writable: true,
});

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
  HouseholdProvider,
  useHouseholdContext,
  useNeedsOnboarding,
  useIsHouseholdAdmin,
} from '../household-context';

describe('HouseholdContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUser.mockReset();
    mockFetch.mockReset();
    (window.localStorage.clear as jest.Mock)();
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);
  });

  const mockContextResponse = {
    success: true,
    data: {
      profile: {
        id: 'profile-1',
        name: 'Test User',
        image: 'https://example.com/avatar.png',
        color: '#3b82f6',
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
    },
  };

  const createWrapper = () => {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <HouseholdProvider>{children}</HouseholdProvider>;
    };
  };

  describe('useHouseholdContext', () => {
    it('should throw error when used outside provider', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useHouseholdContext());
      }).toThrow('useHouseholdContext must be used within a HouseholdProvider');

      consoleError.mockRestore();
    });

    it('should return loading state initially', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should fetch context when user exists', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.profile).not.toBeNull();
      });

      expect(result.current.profile?.id).toBe('profile-1');
      expect(result.current.households).toHaveLength(1);
      expect(result.current.activeHousehold?.id).toBe('household-1');
      expect(result.current.householdProfiles).toHaveLength(2);
    });

    it('should fetch and handle 401 when user is null (supports dev mode)', async () => {
      mockUseUser.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // In dev mode with SKIP_AUTH, we still fetch even when user is null
      // This allows the API to handle auth via SKIP_AUTH env var
      expect(mockFetch).toHaveBeenCalledWith('/api/context');
      expect(result.current.profile).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should set error on fetch failure', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toBe('Failed to fetch context');
    });

    it('should handle 404 response (needs onboarding)', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.profile).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should store active household ID in localStorage', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(window.localStorage.setItem).toHaveBeenCalledWith(
          'hub-ai-active-household',
          'household-1'
        );
      });
    });

    it('should initialize selectedProfileIds with all profiles', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.selectedProfileIds).toHaveLength(2);
      });

      expect(result.current.selectedProfileIds).toContain('profile-1');
      expect(result.current.selectedProfileIds).toContain('profile-2');
    });

    it('should allow setting selected profile IDs', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.selectedProfileIds).toHaveLength(2);
      });

      act(() => {
        result.current.setSelectedProfileIds(['profile-1']);
      });

      expect(result.current.selectedProfileIds).toEqual(['profile-1']);
    });

    it('should check if profile is selected', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.selectedProfileIds).toHaveLength(2);
      });

      expect(result.current.isProfileSelected('profile-1')).toBe(true);
      expect(result.current.isProfileSelected('profile-3')).toBe(false);
    });

    it('should select all profiles', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useHouseholdContext(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.selectedProfileIds).toHaveLength(2);
      });

      // Select only one
      act(() => {
        result.current.setSelectedProfileIds(['profile-1']);
      });

      expect(result.current.selectedProfileIds).toHaveLength(1);

      // Select all
      act(() => {
        result.current.selectAllProfiles();
      });

      expect(result.current.selectedProfileIds).toHaveLength(2);
    });
  });

  describe('useNeedsOnboarding', () => {
    it('should return needsOnboarding=true when profile is null and not loading', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useNeedsOnboarding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.needsOnboarding).toBe(true);
    });

    it('should return needsOnboarding=false when profile exists', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useNeedsOnboarding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.needsOnboarding).toBe(false);
    });
  });

  describe('useIsHouseholdAdmin', () => {
    it('should return true for owner role', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockContextResponse),
      });

      const { result } = renderHook(() => useIsHouseholdAdmin(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should return true for admin role', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockContextResponse,
            data: {
              ...mockContextResponse.data,
              activeHousehold: {
                ...mockContextResponse.data.activeHousehold,
                role: 'admin',
              },
            },
          }),
      });

      const { result } = renderHook(() => useIsHouseholdAdmin(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should return false for member role', async () => {
      mockUseUser.mockReturnValue({ id: 'user-1', displayName: 'Test User' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockContextResponse,
            data: {
              ...mockContextResponse.data,
              activeHousehold: {
                ...mockContextResponse.data.activeHousehold,
                role: 'member',
              },
            },
          }),
      });

      const { result } = renderHook(() => useIsHouseholdAdmin(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current).toBe(false);
      });
    });
  });
});
