/**
 * Unit tests for use-profiles.ts hooks
 * Tests React Query hooks for profile CRUD operations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useProfiles,
  useProfile,
  useCreateProfile,
  useUpdateProfile,
  useDeleteProfile,
  useAssetOwners,
  useUpdateAssetOwners,
} from '../use-profiles';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock HouseholdContext
jest.mock('@/lib/contexts/household-context', () => ({
  useHouseholdContext: () => ({
    activeHousehold: { id: 'household-1', name: 'Test Household' },
  }),
}));

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Wrapper component for React Query hooks
function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('Profiles Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('useProfiles', () => {
    it('should fetch all profiles successfully', async () => {
      const mockProfiles = [
        { id: 'p1', name: 'John', image: null, color: '#3b82f6', role: 'owner', hasUser: true },
        { id: 'p2', name: 'Jane', image: null, color: '#10b981', role: 'member', hasUser: false },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockProfiles,
        }),
      });

      const { result } = renderHook(() => useProfiles(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockProfiles);
      expect(mockFetch).toHaveBeenCalledWith('/api/profiles');
    });

    it('should fetch profiles for specific household', async () => {
      const mockProfiles = [
        { id: 'p1', name: 'John', image: null, color: '#3b82f6', role: 'owner', hasUser: true },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockProfiles,
        }),
      });

      const { result } = renderHook(() => useProfiles('household-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith('/api/profiles?householdId=household-123');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Unauthorized',
        }),
      });

      const { result } = renderHook(() => useProfiles(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useProfile', () => {
    it('should fetch single profile', async () => {
      const mockProfile = {
        id: 'p1',
        name: 'John',
        image: null,
        color: '#3b82f6',
        role: 'owner',
        hasUser: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockProfile,
        }),
      });

      const { result } = renderHook(() => useProfile('p1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockProfile);
      expect(mockFetch).toHaveBeenCalledWith('/api/profiles/p1');
    });

    it('should not fetch when id is empty', async () => {
      const { result } = renderHook(() => useProfile(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle API error when fetching profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Profile not found',
        }),
      });

      const { result } = renderHook(() => useProfile('invalid-id'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Profile not found');
    });
  });

  describe('useCreateProfile', () => {
    it('should create profile successfully', async () => {
      const mockProfile = {
        id: 'p2',
        name: 'New Profile',
        image: null,
        color: '#10b981',
        role: 'member',
        hasUser: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockProfile,
        }),
      });

      const { result } = renderHook(() => useCreateProfile(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          name: 'New Profile',
          color: '#10b981',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/profiles?householdId=household-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Profile',
          color: '#10b981',
        }),
      });
    });

    it('should create profile with image URL', async () => {
      const mockProfile = {
        id: 'p2',
        name: 'New Profile',
        image: 'https://example.com/photo.jpg',
        color: '#3b82f6',
        role: 'member',
        hasUser: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockProfile,
        }),
      });

      const { result } = renderHook(() => useCreateProfile(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          name: 'New Profile',
          image: 'https://example.com/photo.jpg',
          color: '#3b82f6',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('https://example.com/photo.jpg'),
        })
      );
    });

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Name is required',
        }),
      });

      const { result } = renderHook(() => useCreateProfile(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ name: '' });
        })
      ).rejects.toThrow('Name is required');
    });
  });

  describe('useUpdateProfile', () => {
    it('should update profile successfully', async () => {
      const mockUpdated = {
        id: 'p1',
        name: 'Updated Name',
        image: null,
        color: '#ef4444',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUpdated,
        }),
      });

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'p1',
          name: 'Updated Name',
          color: '#ef4444',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/profiles/p1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
          color: '#ef4444',
        }),
      });
    });

    it('should handle update error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Profile not found',
        }),
      });

      const { result } = renderHook(() => useUpdateProfile(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            id: 'invalid-id',
            name: 'Updated Name',
          });
        })
      ).rejects.toThrow('Profile not found');
    });
  });

  describe('useDeleteProfile', () => {
    it('should delete profile successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useDeleteProfile(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('p2');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/profiles/p2', {
        method: 'DELETE',
      });
    });

    it('should handle deletion error for user profiles', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Cannot delete a profile linked to a user',
        }),
      });

      const { result } = renderHook(() => useDeleteProfile(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync('p1');
        })
      ).rejects.toThrow('Cannot delete a profile linked to a user');
    });
  });

  describe('useAssetOwners', () => {
    it('should fetch portfolio account owners', async () => {
      const mockOwners = [
        { id: 'p1', name: 'John', image: null, color: '#3b82f6' },
        { id: 'p2', name: 'Jane', image: null, color: '#10b981' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockOwners,
        }),
      });

      const { result } = renderHook(() => useAssetOwners('portfolio', 'acc-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockOwners);
      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts/acc-1/owners');
    });

    it('should fetch pension account owners', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      const { result } = renderHook(() => useAssetOwners('pension', 'pension-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/accounts/pension-1/owners');
    });

    it('should fetch misc asset owners', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      const { result } = renderHook(() => useAssetOwners('assets', 'asset-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockFetch).toHaveBeenCalledWith('/api/assets/items/asset-1/owners');
    });

    it('should handle API error when fetching owners', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Asset not found',
        }),
      });

      const { result } = renderHook(() => useAssetOwners('portfolio', 'invalid-id'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Asset not found');
    });
  });

  describe('useUpdateAssetOwners', () => {
    it('should update portfolio account owners', async () => {
      const mockUpdated = [{ id: 'p1', name: 'John', image: null, color: '#3b82f6' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUpdated,
        }),
      });

      const { result } = renderHook(() => useUpdateAssetOwners('portfolio'), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          assetId: 'acc-1',
          profileIds: ['p1'],
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts/acc-1/owners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileIds: ['p1'] }),
      });
    });

    it('should update pension account owners', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      const { result } = renderHook(() => useUpdateAssetOwners('pension'), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          assetId: 'pension-1',
          profileIds: ['p1', 'p2'],
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/accounts/pension-1/owners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileIds: ['p1', 'p2'] }),
      });
    });

    it('should update misc asset owners', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [],
        }),
      });

      const { result } = renderHook(() => useUpdateAssetOwners('assets'), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          assetId: 'asset-1',
          profileIds: ['p1'],
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets/items/asset-1/owners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileIds: ['p1'] }),
      });
    });

    it('should handle update owners error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Asset not found',
        }),
      });

      const { result } = renderHook(() => useUpdateAssetOwners('portfolio'), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            assetId: 'invalid-id',
            profileIds: ['p1'],
          });
        })
      ).rejects.toThrow('Asset not found');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate profiles cache after creating profile', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'p1', name: 'New Profile' },
        }),
      });

      const { result } = renderHook(() => useCreateProfile(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'New Profile', color: '#3b82f6' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles'] });
    });

    it('should invalidate profiles cache after updating profile', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'p1', name: 'Updated Profile' },
        }),
      });

      const { result } = renderHook(() => useUpdateProfile(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'p1', name: 'Updated Profile' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles'] });
    });

    it('should invalidate profiles cache after deleting profile', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteProfile(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('p1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles'] });
    });

    it('should invalidate asset owners cache after updating owners', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: 'p1', name: 'John' }],
        }),
      });

      const { result } = renderHook(() => useUpdateAssetOwners('portfolio'), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          assetId: 'acc-1',
          profileIds: ['p1'],
        });
      });

      // The hook invalidates with queryKey ['owners', assetType, assetId]
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['owners', 'portfolio', 'acc-1'],
      });
    });
  });
});
