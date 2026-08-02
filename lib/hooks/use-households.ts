import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Household {
  id: string;
  name: string;
  description: string | null;
  role: 'owner' | 'admin' | 'member';
}

export interface HouseholdMember {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
  role: 'owner' | 'admin' | 'member';
  hasUser: boolean;
  joinedAt: string;
}

export interface HouseholdWithMembers extends Household {
  members: HouseholdMember[];
}

export interface HouseholdInvite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  suggestedName: string | null;
  suggestedColor: string | null;
  createdAt: string;
  expiresAt: string;
}

// Query keys
export const householdKeys = {
  all: ['households'] as const,
  detail: (id: string) => ['households', id] as const,
  invites: (id: string) => ['households', id, 'invites'] as const,
};

/**
 * Fetch all households for current user
 */
export function useHouseholds() {
  return useQuery({
    queryKey: householdKeys.all,
    queryFn: async (): Promise<Household[]> => {
      const response = await fetch('/api/households');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch households');
      }
      return data.data;
    },
  });
}

/**
 * Fetch single household with members
 */
export function useHousehold(id: string) {
  return useQuery({
    queryKey: householdKeys.detail(id),
    queryFn: async (): Promise<HouseholdWithMembers> => {
      const response = await fetch(`/api/households/${id}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch household');
      }
      return data.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new household
 */
export function useCreateHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { name: string; description?: string }): Promise<Household> => {
      const response = await fetch('/api/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create household');
      }
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdKeys.all });
    },
  });
}

/**
 * Update a household
 */
export function useUpdateHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name?: string;
      description?: string;
    }): Promise<Household> => {
      const { id, ...data } = params;
      const response = await fetch(`/api/households/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update household');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: householdKeys.all });
      queryClient.invalidateQueries({ queryKey: householdKeys.detail(variables.id) });
    },
  });
}

/**
 * Delete a household
 */
export function useDeleteHousehold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await fetch(`/api/households/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete household');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdKeys.all });
    },
  });
}

/**
 * Add a member to a household
 */
export function useAddHouseholdMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      householdId: string;
      profileId: string;
      role?: 'admin' | 'member';
    }): Promise<HouseholdMember> => {
      const { householdId, ...data } = params;
      const response = await fetch(`/api/households/${householdId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add member');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: householdKeys.detail(variables.householdId) });
    },
  });
}

/**
 * Update a household member's role
 */
export function useUpdateHouseholdMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      householdId: string;
      profileId: string;
      role: 'admin' | 'member';
    }): Promise<{ id: string; name: string; role: string }> => {
      const { householdId, profileId, role } = params;
      const response = await fetch(`/api/households/${householdId}/members/${profileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update member');
      }
      return result.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: householdKeys.detail(variables.householdId) });
    },
  });
}

/**
 * Remove a member from a household
 */
export function useRemoveHouseholdMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { householdId: string; profileId: string }): Promise<void> => {
      const { householdId, profileId } = params;
      const response = await fetch(`/api/households/${householdId}/members/${profileId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to remove member');
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: householdKeys.detail(variables.householdId) });
    },
  });
}

/** List pending invites for a household (admin/owner only on the server). */
export function useHouseholdInvites(householdId: string) {
  return useQuery({
    queryKey: householdKeys.invites(householdId),
    queryFn: async (): Promise<HouseholdInvite[]> => {
      const response = await fetch(`/api/households/${householdId}/invites`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load invites');
      }
      return data.data;
    },
    enabled: !!householdId,
  });
}

/** Create (or refresh) a pending invite by email. */
export function useCreateHouseholdInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      householdId: string;
      email: string;
      role?: 'admin' | 'member';
      suggestedName?: string | null;
      suggestedColor?: string | null;
    }): Promise<HouseholdInvite> => {
      const { householdId, ...body } = input;
      const response = await fetch(`/api/households/${householdId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create invite');
      }
      return data.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: householdKeys.invites(vars.householdId) });
    },
  });
}

/** Revoke a pending invite. */
export function useRevokeHouseholdInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { householdId: string; inviteId: string }): Promise<void> => {
      const response = await fetch(
        `/api/households/${input.householdId}/invites/${input.inviteId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to revoke invite');
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: householdKeys.invites(vars.householdId) });
    },
  });
}
