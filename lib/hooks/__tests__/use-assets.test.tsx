/**
 * Unit tests for use-assets.ts hooks
 * Tests React Query hooks for assets CRUD operations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useAssets,
  useAssetsList,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
} from '../use-assets';

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

describe('Assets Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('useAssets', () => {
    it('should fetch assets summary successfully', async () => {
      const mockAssetsData = {
        userId: 'user-1',
        totalAssets: 50000,
        totalLiabilities: 10000,
        netValue: 40000,
        assets: [
          {
            id: 'asset-1',
            type: 'bank_deposit',
            name: 'Savings Account',
            currentValue: 50000,
            interestRate: 4.5,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockAssetsData,
        }),
      });

      const { result } = renderHook(() => useAssets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAssetsData);
      expect(mockFetch).toHaveBeenCalledWith('/api/assets');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Unauthorized',
        }),
      });

      const { result } = renderHook(() => useAssets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAssets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useAssetsList', () => {
    it('should fetch assets list successfully', async () => {
      const mockAssetsList = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Savings Account',
          currentValue: 50000,
          interestRate: 4.5,
        },
        {
          id: 'asset-2',
          type: 'loan',
          name: 'Car Loan',
          currentValue: 10000,
          interestRate: 3.5,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockAssetsList,
        }),
      });

      const { result } = renderHook(() => useAssetsList(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAssetsList);
      expect(mockFetch).toHaveBeenCalledWith('/api/assets/items');
    });
  });

  describe('useCreateAsset', () => {
    it('should create bank deposit asset successfully', async () => {
      const mockAsset = {
        id: 'asset-1',
        type: 'bank_deposit',
        name: 'New Savings',
        currentValue: 10000,
        interestRate: 4.25,
        maturityDate: '2025-06-01',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockAsset,
        }),
      });

      const { result } = renderHook(() => useCreateAsset(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          type: 'bank_deposit',
          name: 'New Savings',
          currentValue: 10000,
          interestRate: 4.25,
          maturityDate: '2025-06-01',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bank_deposit',
          name: 'New Savings',
          currentValue: 10000,
          interestRate: 4.25,
          maturityDate: '2025-06-01',
        }),
      });
    });

    it('should create loan asset successfully', async () => {
      const mockAsset = {
        id: 'asset-2',
        type: 'loan',
        name: 'Car Loan',
        currentValue: 20000,
        interestRate: 5.5,
        monthlyPayment: 500,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockAsset,
        }),
      });

      const { result } = renderHook(() => useCreateAsset(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          type: 'loan',
          name: 'Car Loan',
          currentValue: 20000,
          interestRate: 5.5,
          monthlyPayment: 500,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('loan'),
      });
    });

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Name is required',
        }),
      });

      const { result } = renderHook(() => useCreateAsset(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            type: 'bank_deposit',
            name: '',
            currentValue: 1000,
            interestRate: 4.0,
          });
        })
      ).rejects.toThrow('Name is required');
    });
  });

  describe('useUpdateAsset', () => {
    it('should update asset successfully', async () => {
      const mockUpdated = {
        id: 'asset-1',
        type: 'bank_deposit',
        name: 'Updated Savings',
        currentValue: 15000,
        interestRate: 4.75,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUpdated,
        }),
      });

      const { result } = renderHook(() => useUpdateAsset(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'asset-1',
          name: 'Updated Savings',
          currentValue: 15000,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets/items/asset-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Savings',
          currentValue: 15000,
        }),
      });
    });

    it('should handle update error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Asset not found',
        }),
      });

      const { result } = renderHook(() => useUpdateAsset(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            id: 'invalid-id',
            currentValue: 10000,
          });
        })
      ).rejects.toThrow('Asset not found');
    });
  });

  describe('useDeleteAsset', () => {
    it('should delete asset successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useDeleteAsset(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('asset-1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/assets/items/asset-1', {
        method: 'DELETE',
      });
    });

    it('should handle deletion error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Asset not found',
        }),
      });

      const { result } = renderHook(() => useDeleteAsset(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync('invalid-id');
        })
      ).rejects.toThrow('Asset not found');
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate assets cache after creating asset', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'asset-1', type: 'bank_deposit', name: 'Savings' },
        }),
      });

      const { result } = renderHook(() => useCreateAsset(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          type: 'bank_deposit',
          name: 'Savings',
          currentValue: 10000,
          interestRate: 0,
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['assets'] });
    });

    it('should invalidate assets cache after updating asset', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'asset-1', type: 'bank_deposit', currentValue: 15000 },
        }),
      });

      const { result } = renderHook(() => useUpdateAsset(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'asset-1', currentValue: 15000 });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['assets'] });
    });

    it('should invalidate assets cache after deleting asset', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteAsset(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('asset-1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['assets'] });
    });
  });
});
