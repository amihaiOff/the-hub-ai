'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PortfolioSummary } from '@/lib/utils/portfolio';

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface PortfolioData extends PortfolioSummary {
  userId: string;
}

interface StockAccount {
  id: string;
  name: string;
  broker: string | null;
  currency: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  holdings: StockHolding[];
}

interface StockHolding {
  id: string;
  symbol: string;
  quantity: string;
  avgCostBasis: string;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

// Fetch functions
async function fetchPortfolio(): Promise<PortfolioData> {
  const response = await fetch('/api/portfolio');
  const data: ApiResponse<PortfolioData> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch portfolio');
  }

  return data.data;
}

async function createAccount(params: { name: string; broker?: string; currency?: string }): Promise<StockAccount> {
  const response = await fetch('/api/portfolio/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<StockAccount> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to create account');
  }

  return data.data;
}

async function updateAccount(params: {
  id: string;
  name?: string;
  broker?: string | null;
}): Promise<StockAccount> {
  const { id, ...updateData } = params;

  const response = await fetch(`/api/portfolio/accounts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });

  const data: ApiResponse<StockAccount> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to update account');
  }

  return data.data;
}

async function deleteAccount(accountId: string): Promise<void> {
  const response = await fetch(`/api/portfolio/accounts/${accountId}`, {
    method: 'DELETE',
  });

  const data: ApiResponse<void> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete account');
  }
}

async function createHolding(params: {
  accountId: string;
  symbol: string;
  quantity: number;
  avgCostBasis: number;
}): Promise<StockHolding> {
  const response = await fetch('/api/portfolio/holdings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<StockHolding> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to create holding');
  }

  return data.data;
}

async function updateHolding(params: {
  id: string;
  quantity?: number;
  avgCostBasis?: number;
}): Promise<StockHolding> {
  const { id, ...updateData } = params;

  const response = await fetch(`/api/portfolio/holdings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });

  const data: ApiResponse<StockHolding> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to update holding');
  }

  return data.data;
}

async function deleteHolding(holdingId: string): Promise<void> {
  const response = await fetch(`/api/portfolio/holdings/${holdingId}`, {
    method: 'DELETE',
  });

  const data: ApiResponse<void> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete holding');
  }
}

// Hooks
export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useCreateHolding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useUpdateHolding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useDeleteHolding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteHolding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}
