'use client';

import { useAnalysisContext } from './layout';
import { AnalysisSummaryCards } from '@/components/budget/analysis/analysis-summary-cards';
import { OverallTrendChart } from '@/components/budget/analysis/overall-trend-chart';

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
      <OverallTrendChart data={data} />
    </div>
  );
}
