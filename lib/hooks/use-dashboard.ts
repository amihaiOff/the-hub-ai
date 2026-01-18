'use client';

import { useQuery } from '@tanstack/react-query';

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DashboardData {
  netWorth: number;
  portfolio: {
    totalValue: number;
    totalGain: number;
    totalGainPercent: number;
    holdingsCount: number;
  };
  pension: {
    totalValue: number;
    accountsCount: number;
  };
  assets: {
    totalAssets: number;
    totalLiabilities: number;
    netValue: number;
    itemsCount: number;
  };
}

async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch('/api/dashboard');
  const data: ApiResponse<DashboardData> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch dashboard data');
  }

  return data.data;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
  });
}
