'use client';

import { useAnalysisContext } from '../layout';
import { TagSpendingChart } from '@/components/budget/analysis/tag-spending-chart';

export default function AnalysisTagsPage() {
  const { data, isLoading, error } = useAnalysisContext();

  if (isLoading) {
    return (
      <div className="pt-4">
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
    <div className="pt-4">
      <TagSpendingChart data={data} />
    </div>
  );
}
