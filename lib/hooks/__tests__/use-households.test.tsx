/**
 * Unit tests for use-households.ts hooks
 * Tests React Query hooks for household CRUD operations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useHouseholds,
  useHousehold,
  useCreateHousehold,
  useUpdateHousehold,
  useDeleteHousehold,
  useAddHouseholdMember,
  useUpdateHouseholdMember,
  useRemoveHouseholdMember,
} from '../use-households';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

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

describe('Households Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('useHouseholds', () => {
    it('should fetch all households successfully', async () => {
      const mockHouseholds = [
        { id: 'h1', name: 'Family Household', description: null, role: 'owner' },
        { id: 'h2', name: 'Personal', description: 'My personal finances', role: 'member' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockHouseholds,
        }),
      });

      const { result } = renderHook(() => useHouseholds(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockHouseholds);
      expect(mockFetch).toHaveBeenCalledWith('/api/households');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Unauthorized',
        }),
      });

      const { result } = renderHook(() => useHouseholds(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useHousehold', () => {
    it('should fetch single household with members', async () => {
      const mockHousehold = {
        id: 'h1',
        name: 'Family Household',
        description: null,
        role: 'owner',
        members: [
          {
            id: 'p1',
            name: 'John',
            image: null,
            color: '#3b82f6',
            role: 'owner',
            hasUser: true,
            joinedAt: '2024-01-01',
          },
          {
            id: 'p2',
            name: 'Jane',
            image: null,
            color: '#10b981',
            role: 'member',
            hasUser: false,
            joinedAt: '2024-01-02',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockHousehold,
        }),
      });

      const { result } = renderHook(() => useHousehold('h1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockHousehold);
      expect(mockFetch).toHaveBeenCalledWith('/api/households/h1');
    });

    it('should not fetch when id is empty', async () => {
      const { result } = renderHook(() => useHousehold(''), {
        wrapper: createWrapper(),
      });

      // Should not fetch
      expect(result.current.isFetching).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('useCreateHousehold', () => {
    it('should create household successfully', async () => {
      const mockHousehold = {
        id: 'h1',
        name: 'New Household',
        description: 'My description',
        role: 'owner',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockHousehold,
        }),
      });

      const { result } = renderHook(() => useCreateHousehold(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          name: 'New Household',
          description: 'My description',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Household',
          description: 'My description',
        }),
      });
    });

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Name is required',
        }),
      });

      const { result } = renderHook(() => useCreateHousehold(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ name: '' });
        })
      ).rejects.toThrow('Name is required');
    });
  });

  describe('useUpdateHousehold', () => {
    it('should update household successfully', async () => {
      const mockUpdated = {
        id: 'h1',
        name: 'Updated Name',
        description: 'Updated description',
        role: 'owner',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUpdated,
        }),
      });

      const { result } = renderHook(() => useUpdateHousehold(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'h1',
          name: 'Updated Name',
          description: 'Updated description',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/households/h1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
          description: 'Updated description',
        }),
      });
    });
  });

  describe('useDeleteHousehold', () => {
    it('should delete household successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useDeleteHousehold(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('h1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/households/h1', {
        method: 'DELETE',
      });
    });

    it('should handle deletion error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Only owner can delete household',
        }),
      });

      const { result } = renderHook(() => useDeleteHousehold(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync('h1');
        })
      ).rejects.toThrow('Only owner can delete household');
    });
  });

  describe('useAddHouseholdMember', () => {
    it('should add member successfully', async () => {
      const mockMember = {
        id: 'p2',
        name: 'New Member',
        image: null,
        color: '#10b981',
        role: 'member',
        hasUser: false,
        joinedAt: '2024-01-15',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockMember,
        }),
      });

      const { result } = renderHook(() => useAddHouseholdMember(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          householdId: 'h1',
          profileId: 'p2',
          role: 'member',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/households/h1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: 'p2',
          role: 'member',
        }),
      });
    });
  });

  describe('useUpdateHouseholdMember', () => {
    it('should update member role successfully', async () => {
      const mockUpdated = {
        id: 'p2',
        name: 'Member',
        role: 'admin',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUpdated,
        }),
      });

      const { result } = renderHook(() => useUpdateHouseholdMember(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          householdId: 'h1',
          profileId: 'p2',
          role: 'admin',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/households/h1/members/p2', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      });
    });
  });

  describe('useRemoveHouseholdMember', () => {
    it('should remove member successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useRemoveHouseholdMember(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          householdId: 'h1',
          profileId: 'p2',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/households/h1/members/p2', {
        method: 'DELETE',
      });
    });

    it('should handle removal error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Cannot remove owner',
        }),
      });

      const { result } = renderHook(() => useRemoveHouseholdMember(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            householdId: 'h1',
            profileId: 'owner-id',
          });
        })
      ).rejects.toThrow('Cannot remove owner');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate households cache after creating household', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'h1', name: 'Test Household' },
        }),
      });

      const { result } = renderHook(() => useCreateHousehold(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Test Household' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['households'] });
    });

    it('should invalidate households cache after updating household', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'h1', name: 'Updated Name' },
        }),
      });

      const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'h1', name: 'Updated Name' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['households'] });
    });

    it('should invalidate households cache after deleting household', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteHousehold(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('h1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['households'] });
    });

    it('should invalidate households cache after adding member', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'm1', profileId: 'p1', role: 'member' },
        }),
      });

      const { result } = renderHook(() => useAddHouseholdMember(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          householdId: 'h1',
          profileId: 'p1',
          role: 'member',
        });
      });

      // Member operations invalidate specific household cache
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['households', 'h1'] });
    });

    it('should invalidate households cache after removing member', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useRemoveHouseholdMember(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          householdId: 'h1',
          profileId: 'p2',
        });
      });

      // Member operations invalidate specific household cache
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['households', 'h1'] });
    });
  });
});
