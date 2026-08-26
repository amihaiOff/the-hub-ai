'use client';

import dynamic from 'next/dynamic';
import { useAnalysisContext } from './layout';
import { AnalysisSummaryCards } from '@/components/budget/analysis/analysis-summary-cards';
import { InstitutionBreakdown } from '@/components/budget/analysis/institution-breakdown';
import { ChartSkeleton } from '@/components/shared/chart-skeleton';

const IncomeSpendingChart = dynamic(
  () =>
    import('@/components/budget/analysis/income-spending-chart').then((m) => m.IncomeSpendingChart),
  { ssr: false, loading: () => <ChartSkeleton height={288} /> }
);
const CategoryTrendChart = dynamic(
  () =>
    import('@/components/budget/analysis/category-trend-chart').then((m) => m.CategoryTrendChart),
  { ssr: false, loading: () => <ChartSkeleton height={256} /> }
);
const GroupTrendChart = dynamic(
  () => import('@/components/budget/analysis/group-trend-chart').then((m) => m.GroupTrendChart),
  { ssr: false, loading: () => <ChartSkeleton height={256} /> }
);

export default function AnalysisOverallPage() {
  const { data, isLoading, error } = useAnalysisContext();

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4">
        {/* Institution breakdown placeholder — first panel. */}
        <div className="bg-muted h-56 animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="bg-muted h-72 animate-pulse rounded-lg" />
        <div className="bg-muted h-64 animate-pulse rounded-lg" />
        <div className="bg-muted h-64 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed pt-4">
        <p className="text-muted-foreground">Unable to load analysis data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <InstitutionBreakdown data={data} />
      <AnalysisSummaryCards data={data} />
      <IncomeSpendingChart data={data} />
      <CategoryTrendChart data={data} />
      <GroupTrendChart data={data} />
    </div>
  );
}
