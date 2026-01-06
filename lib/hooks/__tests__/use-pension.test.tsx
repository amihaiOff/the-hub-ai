/**
 * Unit tests for use-pension.ts hooks
 * Tests React Query hooks for pension CRUD operations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  usePension,
  useCreatePensionAccount,
  useUpdatePensionAccount,
  useDeletePensionAccount,
  useCreateDeposit,
  useUpdateDeposit,
  useDeleteDeposit,
} from '../use-pension';

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

describe('Pension Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('usePension', () => {
    it('should fetch pension data successfully', async () => {
      const mockPensionData = {
        userId: 'user-1',
        totalValue: 150000,
        totalDeposits: 80000,
        thisMonthDeposits: 3000,
        accountsCount: 2,
        accounts: [
          {
            id: 'acc-1',
            type: 'pension',
            providerName: 'Meitav',
            accountName: 'My Pension',
            currentValue: 100000,
            feeFromDeposit: 0.5,
            feeFromTotal: 0.25,
            totalDeposits: 50000,
            depositsCount: 5,
            deposits: [],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPensionData,
        }),
      });

      const { result } = renderHook(() => usePension(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPensionData);
      expect(mockFetch).toHaveBeenCalledWith('/api/pension');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Unauthorized',
        }),
      });

      const { result } = renderHook(() => usePension(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeDefined();
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePension(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useCreatePensionAccount', () => {
    it('should create pension account successfully', async () => {
      const mockAccount = {
        id: 'acc-1',
        type: 'pension',
        providerName: 'Meitav',
        accountName: 'New Pension',
        currentValue: 50000,
        feeFromDeposit: 0.5,
        feeFromTotal: 0.25,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockAccount,
        }),
      });

      const { result } = renderHook(() => useCreatePensionAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'New Pension',
          currentValue: 50000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'New Pension',
          currentValue: 50000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        }),
      });
    });

    it('should handle creation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Provider name is required',
        }),
      });

      const { result } = renderHook(() => useCreatePensionAccount(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync({
            type: 'pension',
            providerName: '',
            accountName: 'Test',
            currentValue: 1000,
            feeFromDeposit: 0.5,
            feeFromTotal: 0.25,
          });
        })
      ).rejects.toThrow('Provider name is required');
    });
  });

  describe('useUpdatePensionAccount', () => {
    it('should update pension account successfully', async () => {
      const mockUpdated = {
        id: 'acc-1',
        type: 'pension',
        providerName: 'Updated Provider',
        accountName: 'Updated Name',
        currentValue: 75000,
        feeFromDeposit: 0.5,
        feeFromTotal: 0.25,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUpdated,
        }),
      });

      const { result } = renderHook(() => useUpdatePensionAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'acc-1',
          providerName: 'Updated Provider',
          currentValue: 75000,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/accounts/acc-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerName: 'Updated Provider',
          currentValue: 75000,
        }),
      });
    });
  });

  describe('useDeletePensionAccount', () => {
    it('should delete pension account successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useDeletePensionAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('acc-1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/accounts/acc-1', {
        method: 'DELETE',
      });
    });

    it('should handle deletion error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Account not found',
        }),
      });

      const { result } = renderHook(() => useDeletePensionAccount(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync('invalid-id');
        })
      ).rejects.toThrow('Account not found');
    });
  });

  describe('useCreateDeposit', () => {
    it('should create deposit successfully', async () => {
      const mockDeposit = {
        id: 'd1',
        depositDate: '2024-01-15',
        salaryMonth: '2024-01-01',
        amount: 5000,
        employer: 'Company A',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockDeposit,
        }),
      });

      const { result } = renderHook(() => useCreateDeposit(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          accountId: 'acc-1',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Company A',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc-1',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Company A',
        }),
      });
    });
  });

  describe('useUpdateDeposit', () => {
    it('should update deposit successfully', async () => {
      const mockUpdated = {
        id: 'd1',
        depositDate: '2024-01-20',
        salaryMonth: '2024-01-01',
        amount: 6000,
        employer: 'Company B',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockUpdated,
        }),
      });

      const { result } = renderHook(() => useUpdateDeposit(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'd1',
          amount: 6000,
          employer: 'Company B',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/deposits/d1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 6000,
          employer: 'Company B',
        }),
      });
    });
  });

  describe('useDeleteDeposit', () => {
    it('should delete deposit successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useDeleteDeposit(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('d1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/pension/deposits/d1', {
        method: 'DELETE',
      });
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate pension cache after creating account', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'acc-1', type: 'pension', providerName: 'Meitav' },
        }),
      });

      const { result } = renderHook(() => useCreatePensionAccount(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'Test',
          currentValue: 100000,
          feeFromDeposit: 0.5,
          feeFromTotal: 0.25,
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pension'] });
    });

    it('should invalidate pension cache after updating account', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'acc-1', type: 'pension', providerName: 'Meitav' },
        }),
      });

      const { result } = renderHook(() => useUpdatePensionAccount(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'acc-1', currentValue: 150000 });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pension'] });
    });

    it('should invalidate pension cache after deleting account', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeletePensionAccount(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('acc-1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pension'] });
    });

    it('should invalidate pension cache after creating deposit', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'd1', amount: 5000 },
        }),
      });

      const { result } = renderHook(() => useCreateDeposit(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          accountId: 'acc-1',
          depositDate: '2024-01-15',
          salaryMonth: '2024-01-01',
          amount: 5000,
          employer: 'Company A',
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pension'] });
    });

    it('should invalidate pension cache after deleting deposit', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteDeposit(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('d1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pension'] });
    });
  });
});
