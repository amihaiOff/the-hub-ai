import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHouseholdContext } from '@/lib/contexts/household-context';

export interface Profile {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
  role: 'owner' | 'admin' | 'member';
  hasUser: boolean;
}

export interface ProfileOwner {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
}

// Query keys
export const profileKeys = {
  all: (householdId?: string) => ['profiles', householdId] as const,
  detail: (id: string) => ['profiles', 'detail', id] as const,
  owners: (assetType: string, assetId: string) => ['owners', assetType, assetId] as const,
};

/**
 * Fetch all profiles in active household
 */
export function useProfiles(householdId?: string) {
  return useQuery({
    queryKey: profileKeys.all(householdId),
    queryFn: async (): Promise<Profile[]> => {
      const url = householdId ? `/api/profiles?householdId=${householdId}` : '/api/profiles';
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch profiles');
      }
      return data.data;
    },
  });
}

/**
 * Fetch single profile
 */
export function useProfile(id: string) {
  return useQuery({
    queryKey: profileKeys.detail(id),
    queryFn: async (): Promise<Profile & { createdAt: string; updatedAt: string }> => {
      const response = await fetch(`/api/profiles/${id}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch profile');
      }
      return data.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new non-user profile
 */
export function useCreateProfile() {
  const queryClient = useQueryClient();
  const { activeHousehold } = useHouseholdContext();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      image?: string | null;
      color?: string;
    }): Promise<Profile> => {
      const url = activeHousehold
        ? `/api/profiles?householdId=${activeHousehold.id}`
        : '/api/profiles';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create profile');
      }
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['households'] });
    },
  });
}

/**
 * Update a profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      image?: string | null;
      color?: string;
    }): Promise<Profile> => {
      const { id, ...data } = params;
      const response = await fetch(`/api/profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update profile');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: ['households'] });
    },
  });
}

/**
 * Delete a non-user profile
 */
export function useDeleteProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetch(`/api/profiles/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete profile');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['households'] });
    },
  });
}

/**
 * Fetch owners for an asset
 */
export function useAssetOwners(assetType: 'portfolio' | 'pension' | 'assets', assetId: string) {
  const endpoints = {
    portfolio: `/api/portfolio/accounts/${assetId}/owners`,
    pension: `/api/pension/accounts/${assetId}/owners`,
    assets: `/api/assets/items/${assetId}/owners`,
  };

  return useQuery({
    queryKey: profileKeys.owners(assetType, assetId),
    queryFn: async (): Promise<ProfileOwner[]> => {
      const response = await fetch(endpoints[assetType]);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch owners');
      }
      return data.data;
    },
    enabled: !!assetId,
  });
}

/**
 * Update owners for an asset
 */
export function useUpdateAssetOwners(assetType: 'portfolio' | 'pension' | 'assets') {
  const queryClient = useQueryClient();

  const endpoints = {
    portfolio: (id: string) => `/api/portfolio/accounts/${id}/owners`,
    pension: (id: string) => `/api/pension/accounts/${id}/owners`,
    assets: (id: string) => `/api/assets/items/${id}/owners`,
  };

  return useMutation({
    mutationFn: async (params: {
      assetId: string;
      profileIds: string[];
    }): Promise<ProfileOwner[]> => {
      const { assetId, profileIds } = params;
      const response = await fetch(endpoints[assetType](assetId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileIds }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        console.error('Update owners API error:', {
          status: response.status,
          error: result.error,
          debug: result.debug,
        });
        throw new Error(result.error || 'Failed to update owners');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: profileKeys.owners(assetType, variables.assetId),
      });
      // Also invalidate asset lists to refresh owner display
      queryClient.invalidateQueries({ queryKey: [assetType] });
    },
  });
}
