'use client';

import { useAnalysisContext } from '../layout';
import { CategoryPieCharts } from '@/components/budget/analysis/category-pie-charts';

export default function AnalysisCategoriesPage() {
  const { data, isLoading, error } = useAnalysisContext();

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted h-72 animate-pulse rounded-lg" />
          ))}
        </div>
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
    <div className="pt-4">
      <CategoryPieCharts data={data} />
    </div>
  );
}
