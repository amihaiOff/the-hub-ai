'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { MiscAsset, AssetsSummary, MiscAssetType } from '@/lib/utils/assets';

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreateAssetParams {
  type: MiscAssetType;
  name: string;
  currentValue: number;
  interestRate: number;
  monthlyPayment?: number | null;
  monthlyDeposit?: number | null;
  maturityDate?: string | null;
}

interface UpdateAssetParams {
  id: string;
  name?: string;
  currentValue?: number;
  interestRate?: number;
  monthlyPayment?: number | null;
  monthlyDeposit?: number | null;
  maturityDate?: string | null;
}

// Fetch functions
async function fetchAssets(): Promise<AssetsSummary> {
  const response = await fetch('/api/assets');
  const data: ApiResponse<AssetsSummary> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch assets data');
  }

  return data.data;
}

async function fetchAssetsList(): Promise<MiscAsset[]> {
  const response = await fetch('/api/assets/items');
  const data: ApiResponse<MiscAsset[]> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch assets list');
  }

  return data.data;
}

async function createAsset(params: CreateAssetParams): Promise<MiscAsset> {
  const response = await fetch('/api/assets/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<MiscAsset> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to create asset');
  }

  return data.data;
}

async function updateAsset(params: UpdateAssetParams): Promise<MiscAsset> {
  const { id, ...updateData } = params;

  const response = await fetch(`/api/assets/items/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });

  const data: ApiResponse<MiscAsset> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to update asset');
  }

  return data.data;
}

async function deleteAsset(assetId: string): Promise<void> {
  const response = await fetch(`/api/assets/items/${assetId}`, {
    method: 'DELETE',
  });

  const data: ApiResponse<void> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete asset');
  }
}

// Hooks

/**
 * Hook to fetch assets summary with totals
 */
export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: fetchAssets,
  });
}

/**
 * Hook to fetch just the assets list
 */
export function useAssetsList() {
  return useQuery({
    queryKey: ['assets', 'list'],
    queryFn: fetchAssetsList,
  });
}

/**
 * Hook to create a new asset
 */
export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

/**
 * Hook to update an asset
 */
export function useUpdateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

/**
 * Hook to delete an asset
 */
export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
