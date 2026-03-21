'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Types
export interface InsurancePolicyData {
  id: string;
  profileId: string;
  householdId: string;
  mainBranch: string;
  subBranch: string | null;
  productType: string | null;
  company: string | null;
  insurancePeriod: string | null;
  additionalDetails: string | null;
  premiumIls: number | null;
  premiumType: string | null;
  policyNumber: string | null;
  planClassification: string | null;
  createdAt: string;
  updatedAt: string;
  profile: {
    id: string;
    name: string;
    color: string | null;
    image: string | null;
  };
}

export interface InsuranceGroupedData {
  [profileId: string]: {
    profile: {
      id: string;
      name: string;
      color: string | null;
      image: string | null;
    };
    policies: InsurancePolicyData[];
  };
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function fetchInsurancePolicies(): Promise<InsuranceGroupedData> {
  const response = await fetch('/api/insurance');
  const data: ApiResponse<InsuranceGroupedData> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch insurance policies');
  }

  return data.data;
}

async function deletePolicy(id: string): Promise<void> {
  const response = await fetch(`/api/insurance/${id}`, {
    method: 'DELETE',
  });

  const data: ApiResponse<void> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to delete insurance policy');
  }
}

async function importInsurance(params: {
  file: File;
  profileId: string;
}): Promise<{ imported: number }> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('profileId', params.profileId);

  const response = await fetch('/api/insurance/import', {
    method: 'POST',
    body: formData,
  });

  const data: ApiResponse<{ imported: number }> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to import insurance data');
  }

  return data.data;
}

/**
 * Hook to fetch all insurance policies for the household, grouped by profile
 */
export function useInsurancePolicies() {
  return useQuery({
    queryKey: ['insurance'],
    queryFn: fetchInsurancePolicies,
  });
}

/**
 * Hook to delete an insurance policy
 */
export function useDeleteInsurancePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
    },
  });
}

/**
 * Hook to import insurance policies from Excel
 */
export function useImportInsurance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importInsurance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
    },
  });
}
