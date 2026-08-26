'use client';

import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/shared/chart-skeleton';

/**
 * Lazy wrapper around {@link AllocationChart} so Recharts is code-split
 * out of the initial bundle. Re-exported under the original name via the
 * portfolio barrel, so every consumer gets the deferred version.
 */
export const AllocationChart = dynamic(
  () => import('./allocation-chart').then((m) => m.AllocationChart),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);
