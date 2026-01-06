'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PensionSummary,
  PensionAccountSummary,
  PensionAccountType,
  DepositValue,
} from '@/lib/utils/pension';

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreatePensionAccountParams {
  type: PensionAccountType;
  providerName: string;
  accountName: string;
  currentValue: number;
  feeFromDeposit: number;
  feeFromTotal: number;
}

interface UpdatePensionAccountParams {
  id: string;
  providerName?: string;
  accountName?: string;
  currentValue?: number;
  feeFromDeposit?: number;
  feeFromTotal?: number;
}

interface CreateDepositParams {
  accountId: string;
  depositDate: string;
  salaryMonth: string;
  amount: number;
  employer: string;
}

interface UpdateDepositParams {
  id: string;
  depositDate?: string;
  salaryMonth?: string;
  amount?: number;
  employer?: string;
}

// PDF Upload types
export interface ParsedDepositFromPdf {
  depositDate: string;
  salaryMonth: string;
  amount: number;
  employer: string;
}

export interface ParsePdfResult {
  deposits: ParsedDepositFromPdf[];
  providerName: string | null;
  reportDate: string | null;
  memberName: string | null;
  warnings: string[];
}

interface BulkCreateDepositsParams {
  accountId: string;
  deposits: ParsedDepositFromPdf[];
}

interface BulkCreateDepositsResult {
  count: number;
  deposits: DepositValue[];
}

// Fetch functions
async function fetchPension(): Promise<PensionSummary> {
  const response = await fetch('/api/pension');
  const data: ApiResponse<PensionSummary> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch pension data');
  }

  return data.data;
}

async function createPensionAccount(
  params: CreatePensionAccountParams
): Promise<PensionAccountSummary> {
  const response = await fetch('/api/pension/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<PensionAccountSummary> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to create pension account');
  }

  return data.data;
}

async function updatePensionAccount(
  params: UpdatePensionAccountParams
): Promise<PensionAccountSummary> {
  const { id, ...updateData } = params;

  const response = await fetch(`/api/pension/accounts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });

  const data: ApiResponse<PensionAccountSummary> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to update pension account');
  }

  return data.data;
}

async function deletePensionAccount(accountId: string): Promise<void> {
  const response = await fetch(`/api/pension/accounts/${accountId}`, {
    method: 'DELETE',
  });

  const data: ApiResponse<void> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete pension account');
  }
}

async function createDeposit(params: CreateDepositParams): Promise<DepositValue> {
  const response = await fetch('/api/pension/deposits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<DepositValue> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to create deposit');
  }

  return data.data;
}

async function updateDeposit(params: UpdateDepositParams): Promise<DepositValue> {
  const { id, ...updateData } = params;

  const response = await fetch(`/api/pension/deposits/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updateData),
  });

  const data: ApiResponse<DepositValue> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to update deposit');
  }

  return data.data;
}

async function deleteDeposit(depositId: string): Promise<void> {
  const response = await fetch(`/api/pension/deposits/${depositId}`, {
    method: 'DELETE',
  });

  const data: ApiResponse<void> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete deposit');
  }
}

async function parsePensionPdf(file: File): Promise<ParsePdfResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/pension/parse-pdf', {
    method: 'POST',
    body: formData,
  });

  const data: ApiResponse<ParsePdfResult> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to parse PDF');
  }

  return data.data;
}

async function bulkCreateDeposits(
  params: BulkCreateDepositsParams
): Promise<BulkCreateDepositsResult> {
  const response = await fetch('/api/pension/deposits/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<BulkCreateDepositsResult> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to create deposits');
  }

  return data.data;
}

// Hooks
export function usePension() {
  return useQuery({
    queryKey: ['pension'],
    queryFn: fetchPension,
  });
}

export function useCreatePensionAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPensionAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pension'] });
    },
  });
}

export function useUpdatePensionAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePensionAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pension'] });
    },
  });
}

export function useDeletePensionAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePensionAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pension'] });
    },
  });
}

export function useCreateDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDeposit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pension'] });
    },
  });
}

export function useUpdateDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDeposit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pension'] });
    },
  });
}

export function useDeleteDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDeposit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pension'] });
    },
  });
}

export function useParsePensionPdf() {
  return useMutation({
    mutationFn: parsePensionPdf,
  });
}

export function useBulkCreateDeposits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkCreateDeposits,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pension'] });
    },
  });
}
