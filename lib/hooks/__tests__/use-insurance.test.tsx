/**
 * Unit tests for use-insurance.ts hooks
 * Tests React Query hooks for insurance policy operations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useInsurancePolicies,
  useDeleteInsurancePolicy,
  useImportInsurance,
  type InsuranceGroupedData,
} from '../use-insurance';

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

const mockInsuranceData: InsuranceGroupedData = {
  'profile-1': {
    profile: {
      id: 'profile-1',
      name: 'Alice',
      color: '#3B82F6',
      image: null,
    },
    policies: [
      {
        id: 'policy-1',
        profileId: 'profile-1',
        householdId: 'hh-1',
        mainBranch: 'Life',
        subBranch: 'Term',
        productType: 'life_insurance',
        company: 'Harel',
        insurancePeriod: '2025-01-01 to 2030-12-31',
        additionalDetails: null,
        premiumIls: 250,
        premiumType: 'monthly',
        policyNumber: 'L-12345',
        planClassification: 'standard',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        profile: {
          id: 'profile-1',
          name: 'Alice',
          color: '#3B82F6',
          image: null,
        },
      },
    ],
  },
};

describe('Insurance Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('useInsurancePolicies', () => {
    it('should fetch insurance policies grouped by profile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockInsuranceData }),
      });

      const { result } = renderHook(() => useInsurancePolicies(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockInsuranceData);
      expect(mockFetch).toHaveBeenCalledWith('/api/insurance');
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Unauthorized' }),
      });

      const { result } = renderHook(() => useInsurancePolicies(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('Unauthorized');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useInsurancePolicies(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });

    it('should handle empty data (no policies)', async () => {
      const emptyData: InsuranceGroupedData = {};

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: emptyData }),
      });

      const { result } = renderHook(() => useInsurancePolicies(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({});
    });
  });

  describe('useDeleteInsurancePolicy', () => {
    it('should delete an insurance policy successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteInsurancePolicy(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutateAsync('policy-1');
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/insurance/policy-1', {
        method: 'DELETE',
      });
    });

    it('should handle deletion error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Policy not found' }),
      });

      const { result } = renderHook(() => useDeleteInsurancePolicy(), {
        wrapper: createWrapper(),
      });

      await expect(
        act(async () => {
          await result.current.mutateAsync('nonexistent');
        })
      ).rejects.toThrow('Policy not found');
    });

    it('should invalidate insurance cache after deleting policy', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { result } = renderHook(() => useDeleteInsurancePolicy(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('policy-1');
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['insurance'] });
    });
  });

  describe('useImportInsurance', () => {
    it('should import insurance policies from Excel file', async () => {
      const importResult = { imported: 5 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: importResult }),
      });

      const { result } = renderHook(() => useImportInsurance(), {
        wrapper: createWrapper(),
      });

      const mockFile = new File(['mock excel content'], 'insurance.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await act(async () => {
        const res = await result.current.mutateAsync({
          file: mockFile,
          profileId: 'profile-1',
        });
        expect(res).toEqual(importResult);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/insurance/import',
        expect.objectContaining({ method: 'POST' })
      );

      // Verify FormData was used (no Content-Type header - browser sets it with boundary)
      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.body).toBeInstanceOf(FormData);
    });

    it('should handle import error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Invalid file format' }),
      });

      const { result } = renderHook(() => useImportInsurance(), {
        wrapper: createWrapper(),
      });

      const mockFile = new File(['bad content'], 'bad.txt', { type: 'text/plain' });

      await expect(
        act(async () => {
          await result.current.mutateAsync({ file: mockFile, profileId: 'profile-1' });
        })
      ).rejects.toThrow('Invalid file format');
    });

    it('should invalidate insurance cache after import', async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { imported: 3 } }),
      });

      const { result } = renderHook(() => useImportInsurance(), { wrapper });

      const mockFile = new File(['content'], 'data.xlsx');

      await act(async () => {
        await result.current.mutateAsync({ file: mockFile, profileId: 'profile-1' });
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['insurance'] });
    });
  });
});
