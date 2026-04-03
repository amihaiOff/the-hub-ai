'use client';

import { useAnalysisContext } from './layout';
import { AnalysisSummaryCards } from '@/components/budget/analysis/analysis-summary-cards';
import { IncomeSpendingChart } from '@/components/budget/analysis/income-spending-chart';
import { CategoryTrendChart } from '@/components/budget/analysis/category-trend-chart';
import { GroupTrendChart } from '@/components/budget/analysis/group-trend-chart';
import { TagSpendingOverviewChart } from '@/components/budget/analysis/tag-spending-overview-chart';

export default function AnalysisOverallPage() {
  const { data, isLoading, error } = useAnalysisContext();

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="bg-muted h-72 animate-pulse rounded-lg" />
        <div className="bg-muted h-64 animate-pulse rounded-lg" />
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
      <AnalysisSummaryCards data={data} />
      <IncomeSpendingChart data={data} />
      <CategoryTrendChart data={data} />
      <GroupTrendChart data={data} />
      <TagSpendingOverviewChart data={data} />
    </div>
  );
}
