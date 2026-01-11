'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '@stackframe/stack';

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

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const [data, setData] = useState<HouseholdContextData>({
    profile: null,
    households: [],
    activeHousehold: null,
    householdProfiles: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);

  // Fetch household context from API
  const fetchContext = useCallback(async () => {
    // Note: With Stack Auth, user will be null if not authenticated
    // In dev mode with SKIP_AUTH, API still works without auth

    try {
      setIsLoading(true);
      setError(null);

      // Get stored active household ID
      const storedHouseholdId =
        typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_HOUSEHOLD_KEY) : null;

      const url = storedHouseholdId
        ? `/api/context?householdId=${storedHouseholdId}`
        : '/api/context';

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          // User needs onboarding
          setData({
            profile: null,
            households: [],
            activeHousehold: null,
            householdProfiles: [],
          });
          return;
        }
        if (response.status === 401) {
          // Not authenticated (production mode without login)
          setData({
            profile: null,
            households: [],
            activeHousehold: null,
            householdProfiles: [],
          });
          return;
        }
        throw new Error('Failed to fetch context');
      }

      const result = await response.json();

      if (result.success && result.data) {
        const contextData: HouseholdContextData = {
          profile: result.data.profile,
          households: result.data.households,
          activeHousehold: result.data.activeHousehold,
          householdProfiles: result.data.householdProfiles,
        };

        setData(contextData);

        // Store active household ID
        if (contextData.activeHousehold) {
          localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, contextData.activeHousehold.id);
        }

        // Initialize selected profiles (default: all profiles)
        const storedProfiles =
          typeof window !== 'undefined' ? localStorage.getItem(SELECTED_PROFILES_KEY) : null;

        if (storedProfiles) {
          try {
            const parsed = JSON.parse(storedProfiles);
            // Filter to only valid profile IDs
            const validIds = parsed.filter((id: string) =>
              contextData.householdProfiles.some((p) => p.id === id)
            );
            setSelectedProfileIds(
              validIds.length > 0 ? validIds : contextData.householdProfiles.map((p) => p.id)
            );
          } catch {
            setSelectedProfileIds(contextData.householdProfiles.map((p) => p.id));
          }
        } else {
          setSelectedProfileIds(contextData.householdProfiles.map((p) => p.id));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch on mount and auth status change
  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Set active household
  const setActiveHouseholdId = useCallback(
    (id: string) => {
      const household = data.households.find((h) => h.id === id);
      if (household) {
        localStorage.setItem(ACTIVE_HOUSEHOLD_KEY, id);
        // Refetch to get new household profiles
        fetchContext();
      }
    },
    [data.households, fetchContext]
  );

  // Select all profiles
  const selectAllProfiles = useCallback(() => {
    const allIds = data.householdProfiles.map((p) => p.id);
    setSelectedProfileIds(allIds);
    localStorage.setItem(SELECTED_PROFILES_KEY, JSON.stringify(allIds));
  }, [data.householdProfiles]);

  // Update selected profiles with persistence
  const handleSetSelectedProfileIds = useCallback((ids: string[]) => {
    setSelectedProfileIds(ids);
    localStorage.setItem(SELECTED_PROFILES_KEY, JSON.stringify(ids));
  }, []);

  // Check if profile is selected
  const isProfileSelected = useCallback(
    (profileId: string) => selectedProfileIds.includes(profileId),
    [selectedProfileIds]
  );

  const value = useMemo<HouseholdContextValue>(
    () => ({
      ...data,
      isLoading,
      error,
      setActiveHouseholdId,
      selectedProfileIds,
      setSelectedProfileIds: handleSetSelectedProfileIds,
      selectAllProfiles,
      isProfileSelected,
      refetch: fetchContext,
    }),
    [
      data,
      isLoading,
      error,
      setActiveHouseholdId,
      selectedProfileIds,
      handleSetSelectedProfileIds,
      selectAllProfiles,
      isProfileSelected,
      fetchContext,
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
