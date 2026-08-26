'use client';

import dynamic from 'next/dynamic';
import { ChartSkeleton } from '@/components/shared/chart-skeleton';

/**
 * Lazy wrapper around {@link PortfolioGainsChart} so Recharts is code-split
 * out of the initial bundle. Re-exported under the original name via the
 * portfolio barrel, so every consumer gets the deferred version.
 */
export const PortfolioGainsChart = dynamic(
  () => import('./portfolio-gains-chart').then((m) => m.PortfolioGainsChart),
  { ssr: false, loading: () => <ChartSkeleton height={128} /> }
);
