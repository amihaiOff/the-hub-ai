/**
 * Unit tests for use-portfolio.ts hooks
 * Tests React Query hooks for portfolio CRUD operations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  usePortfolio,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useCreateHolding,
  useUpdateHolding,
  useDeleteHolding,
} from '../use-portfolio';

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

describe('Portfolio Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('usePortfolio', () => {
    it('should fetch portfolio data successfully', async () => {
      const mockPortfolio = {
        userId: 'user-1',
        accounts: [
          {
            id: 'acc-1',
            name: 'IRA',
            broker: 'Fidelity',
            holdings: [],
            totalValue: 10000,
            totalGainLoss: 500,
            totalGainLossPercent: 5,
          },
        ],
        totalValue: 10000,
        totalGainLoss: 500,
        totalGainLossPercent: 5,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPortfolio,
        }),
      });

      const { result } = renderHook(() => usePortfolio(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPortfolio);
      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Unauthorized',
        }),
      });

      const { result } = renderHook(() => usePortfolio(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(new Error('Unauthorized'));
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePortfolio(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Network error');
    });
  });

  describe('useCreateAccount', () => {
    it('should create account successfully', async () => {
      const newAccount = {
        id: 'acc-new',
        name: 'New Account',
        broker: 'Vanguard',
        currency: 'USD',
        userId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        holdings: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: newAccount,
        }),
      });

      const { result } = renderHook(() => useCreateAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const created = await result.current.mutateAsync({
          name: 'New Account',
          broker: 'Vanguard',
          currency: 'USD',
        });
        expect(created).toEqual(newAccount);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Account',
          broker: 'Vanguard',
          currency: 'USD',
        }),
      });
    });

    it('should handle create account error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Account name already exists',
        }),
      });

      const { result } = renderHook(() => useCreateAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(result.current.mutateAsync({ name: 'Duplicate' })).rejects.toThrow(
          'Account name already exists'
        );
      });
    });

    it('should create account without optional fields', async () => {
      const newAccount = {
        id: 'acc-new',
        name: 'Basic Account',
        broker: null,
        currency: 'USD',
        userId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        holdings: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: newAccount,
        }),
      });

      const { result } = renderHook(() => useCreateAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Basic Account' });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Basic Account' }),
      });
    });
  });

  describe('useUpdateAccount', () => {
    it('should update account name and broker', async () => {
      const updatedAccount = {
        id: 'acc-1',
        name: 'Updated Name',
        broker: 'New Broker',
        currency: 'USD',
        userId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        holdings: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: updatedAccount,
        }),
      });

      const { result } = renderHook(() => useUpdateAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const updated = await result.current.mutateAsync({
          id: 'acc-1',
          name: 'Updated Name',
          broker: 'New Broker',
        });
        expect(updated).toEqual(updatedAccount);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Name',
          broker: 'New Broker',
        }),
      });
    });

    it('should update account with null broker', async () => {
      const updatedAccount = {
        id: 'acc-1',
        name: 'No Broker Account',
        broker: null,
        currency: 'USD',
        userId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        holdings: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: updatedAccount,
        }),
      });

      const { result } = renderHook(() => useUpdateAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'acc-1',
          name: 'No Broker Account',
          broker: null,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'No Broker Account',
          broker: null,
        }),
      });
    });

    it('should handle update account error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Account not found',
        }),
      });

      const { result } = renderHook(() => useUpdateAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({ id: 'invalid-id', name: 'Test' })
        ).rejects.toThrow('Account not found');
      });
    });

    it('should only update name when broker is not provided', async () => {
      const updatedAccount = {
        id: 'acc-1',
        name: 'Only Name Changed',
        broker: 'Original Broker',
        currency: 'USD',
        userId: 'user-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        holdings: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: updatedAccount,
        }),
      });

      const { result } = renderHook(() => useUpdateAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'acc-1',
          name: 'Only Name Changed',
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Only Name Changed' }),
      });
    });
  });

  describe('useDeleteAccount', () => {
    it('should delete account successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('acc-1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/accounts/acc-1', {
        method: 'DELETE',
      });
    });

    it('should handle delete account error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Cannot delete account with holdings',
        }),
      });

      const { result } = renderHook(() => useDeleteAccount(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(result.current.mutateAsync('acc-1')).rejects.toThrow(
          'Cannot delete account with holdings'
        );
      });
    });
  });

  describe('useCreateHolding', () => {
    it('should create holding successfully', async () => {
      const newHolding = {
        id: 'hold-1',
        symbol: 'AAPL',
        quantity: '10',
        avgCostBasis: '150.00',
        accountId: 'acc-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: newHolding,
        }),
      });

      const { result } = renderHook(() => useCreateHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const created = await result.current.mutateAsync({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150.0,
        });
        expect(created).toEqual(newHolding);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150.0,
        }),
      });
    });

    it('should handle create holding error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Invalid symbol',
        }),
      });

      const { result } = renderHook(() => useCreateHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            accountId: 'acc-1',
            symbol: 'INVALID',
            quantity: 10,
            avgCostBasis: 100,
          })
        ).rejects.toThrow('Invalid symbol');
      });
    });
  });

  describe('useUpdateHolding', () => {
    it('should update holding quantity', async () => {
      const updatedHolding = {
        id: 'hold-1',
        symbol: 'AAPL',
        quantity: '20',
        avgCostBasis: '150.00',
        accountId: 'acc-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: updatedHolding,
        }),
      });

      const { result } = renderHook(() => useUpdateHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const updated = await result.current.mutateAsync({
          id: 'hold-1',
          quantity: 20,
        });
        expect(updated).toEqual(updatedHolding);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 20 }),
      });
    });

    it('should update holding cost basis', async () => {
      const updatedHolding = {
        id: 'hold-1',
        symbol: 'AAPL',
        quantity: '10',
        avgCostBasis: '175.50',
        accountId: 'acc-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: updatedHolding,
        }),
      });

      const { result } = renderHook(() => useUpdateHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'hold-1',
          avgCostBasis: 175.5,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avgCostBasis: 175.5 }),
      });
    });

    it('should update both quantity and cost basis', async () => {
      const updatedHolding = {
        id: 'hold-1',
        symbol: 'AAPL',
        quantity: '25',
        avgCostBasis: '160.00',
        accountId: 'acc-1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: updatedHolding,
        }),
      });

      const { result } = renderHook(() => useUpdateHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync({
          id: 'hold-1',
          quantity: 25,
          avgCostBasis: 160,
        });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/holdings/hold-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 25, avgCostBasis: 160 }),
      });
    });

    it('should handle update holding error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Holding not found',
        }),
      });

      const { result } = renderHook(() => useUpdateHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(result.current.mutateAsync({ id: 'invalid', quantity: 10 })).rejects.toThrow(
          'Holding not found'
        );
      });
    });
  });

  describe('useDeleteHolding', () => {
    it('should delete holding successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
        }),
      });

      const { result } = renderHook(() => useDeleteHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('hold-1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/portfolio/holdings/hold-1', {
        method: 'DELETE',
      });
    });

    it('should handle delete holding error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Holding not found',
        }),
      });

      const { result } = renderHook(() => useDeleteHolding(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await expect(result.current.mutateAsync('invalid')).rejects.toThrow('Holding not found');
      });
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate portfolio cache after creating account', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'acc-1', name: 'Test', holdings: [] },
        }),
      });

      const { result } = renderHook(() => useCreateAccount(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ name: 'Test' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    });

    it('should invalidate portfolio cache after updating account', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'acc-1', name: 'Updated', holdings: [] },
        }),
      });

      const { result } = renderHook(() => useUpdateAccount(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'acc-1', name: 'Updated' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    });

    it('should invalidate portfolio cache after deleting account', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteAccount(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('acc-1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    });

    it('should invalidate portfolio cache after creating holding', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'hold-1', symbol: 'AAPL' },
        }),
      });

      const { result } = renderHook(() => useCreateHolding(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          accountId: 'acc-1',
          symbol: 'AAPL',
          quantity: 10,
          avgCostBasis: 150,
        });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    });

    it('should invalidate portfolio cache after updating holding', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 'hold-1', quantity: '20' },
        }),
      });

      const { result } = renderHook(() => useUpdateHolding(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: 'hold-1', quantity: 20 });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    });

    it('should invalidate portfolio cache after deleting holding', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteHolding(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('hold-1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    });
  });
});
