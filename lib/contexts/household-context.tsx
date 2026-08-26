'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/lib/hooks/use-auth';

export interface HouseholdProfile {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
  role: 'owner' | 'admin' | 'member';
  hasUser: boolean;
}

export interface Household {
  id: string;
  name: string;
  description: string | null;
  role: 'owner' | 'admin' | 'member';
}

export interface CurrentProfile {
  id: string;
  name: string;
  image: string | null;
  color: string | null;
}

interface HouseholdContextData {
  profile: CurrentProfile | null;
  households: Household[];
  activeHousehold: Household | null;
  householdProfiles: HouseholdProfile[];
}

interface HouseholdContextValue extends HouseholdContextData {
  isLoading: boolean;
  error: Error | null;
  setActiveHouseholdId: (id: string) => void;
  selectedProfileIds: string[];
  setSelectedProfileIds: (ids: string[]) => void;
  selectAllProfiles: () => void;
  isProfileSelected: (profileId: string) => boolean;
  refetch: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

const ACTIVE_HOUSEHOLD_KEY = 'hub-ai-active-household';
const SELECTED_PROFILES_KEY = 'hub-ai-selected-profiles';

const EMPTY_CONTEXT: HouseholdContextData = {
  profile: null,
  households: [],
  activeHousehold: null,
  householdProfiles: [],
};

/**
 * Fetch the household context. 404 (needs onboarding) and 401 (not
 * authenticated) resolve to an empty context rather than throwing, so the
 * onboarding check (`profile === null`) still works.
 */
async function fetchContextData(householdId: string | null): Promise<HouseholdContextData> {
  const url = householdId ? `/api/context?householdId=${householdId}` : '/api/context';
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404 || response.status === 401) return EMPTY_CONTEXT;
    throw new Error('Failed to fetch context');
  }
  const result = await response.json();
  if (result.success && result.data) {
    return {
      profile: result.data.profile,
      households: result.data.households,
      activeHousehold: result.data.activeHousehold,
      householdProfiles: result.data.householdProfiles,
    };
  }
  return EMPTY_CONTEXT;
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const userId = (user as { id?: string } | null)?.id ?? 'anon';
  const [activeHouseholdId, setActiveHouseholdIdState] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_HOUSEHOLD_KEY) : null
  );
  // The user's explicit profile-selection override (null = "no choice yet",
  // defaults to all profiles). Seeded from localStorage.
  const [profileOverride, setProfileOverride] = useState<string[] | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(SELECTED_PROFILES_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as string[];
    } catch {
      return null;
    }
  });

  // Cached via TanStack Query (keyed by user + active household) so navigating
  // between pages — or a shell remount — reuses the context instead of
  // re-fetching it every time (the old raw useEffect fetch re-fired on every
  // mount, which is what made entering /budget slow).
  const query = useQuery({
    queryKey: ['context', userId, activeHouseholdId],
    queryFn: () => fetchContextData(activeHouseholdId),
    staleTime: 60 * 1000,
  });

  const data = query.data ?? EMPTY_CONTEXT;
  const isLoading = query.isLoading;
  const error = (query.error as Error | null) ?? null;

  // Persist the resolved active household (side-effect only — no setState, so
  // it doesn't trip react-hooks/set-state-in-effect).
  const resolvedHouseholdId = data.activeHousehold?.id;
  useEffect(() => {
    if (resolvedHouseholdId) localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, resolvedHouseholdId);
  }, [resolvedHouseholdId]);

  // Effective selection, derived during render: the user's override filtered to
  // profiles that still exist, defaulting to all profiles. No effect / setState
  // dance, so cached navigations never clobber the current selection.
  const selectedProfileIds = useMemo(() => {
    const allIds = data.householdProfiles.map((p) => p.id);
    if (!profileOverride) return allIds;
    const validIds = profileOverride.filter((id) => allIds.includes(id));
    return validIds.length > 0 ? validIds : allIds;
  }, [data.householdProfiles, profileOverride]);

  // Set active household — updates the query key, which refetches (and caches)
  // for that household. Unknown ids are ignored (matches prior behavior).
  const setActiveHouseholdId = useCallback(
    (id: string) => {
      if (!data.households.some((h) => h.id === id)) return;
      localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, id);
      setActiveHouseholdIdState(id);
    },
    [data.households]
  );

  const setSelectedProfileIds = useCallback((ids: string[]) => {
    setProfileOverride(ids);
    localStorage.setItem(SELECTED_PROFILES_KEY, JSON.stringify(ids));
  }, []);

  const selectAllProfiles = useCallback(() => {
    const allIds = data.householdProfiles.map((p) => p.id);
    setProfileOverride(allIds);
    localStorage.setItem(SELECTED_PROFILES_KEY, JSON.stringify(allIds));
  }, [data.householdProfiles]);

  const isProfileSelected = useCallback(
    (profileId: string) => selectedProfileIds.includes(profileId),
    [selectedProfileIds]
  );

  const queryRefetch = query.refetch;
  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  const value = useMemo<HouseholdContextValue>(
    () => ({
      ...data,
      isLoading,
      error,
      setActiveHouseholdId,
      selectedProfileIds,
      setSelectedProfileIds,
      selectAllProfiles,
      isProfileSelected,
      refetch,
    }),
    [
      data,
      isLoading,
      error,
      setActiveHouseholdId,
      selectedProfileIds,
      setSelectedProfileIds,
      selectAllProfiles,
      isProfileSelected,
      refetch,
    ]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHouseholdContext() {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHouseholdContext must be used within a HouseholdProvider');
  }
  return context;
}

/**
 * Hook to check if user needs onboarding (no profile yet)
 */
export function useNeedsOnboarding() {
  const { profile, isLoading } = useHouseholdContext();
  return { needsOnboarding: !isLoading && profile === null, isLoading };
}

/**
 * Hook to check if user is admin/owner in current household
 */
export function useIsHouseholdAdmin() {
  const { activeHousehold } = useHouseholdContext();
  return activeHousehold?.role === 'owner' || activeHousehold?.role === 'admin';
}
