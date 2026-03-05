'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useBudgetAnalysis, type AnalysisData } from '@/lib/hooks/use-budget';
import { DateRangePicker } from '@/components/budget/analysis/date-range-picker';
import { AnalysisTabBar } from '@/components/budget/analysis/analysis-tab-bar';

interface AnalysisContextValue {
  data: AnalysisData | undefined;
  isLoading: boolean;
  error: Error | null;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function useAnalysisContext() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysisContext must be used within AnalysisLayout');
  return ctx;
}

const ALL_TIME_START = '2000-01-01';

function formatDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const today = useMemo(() => formatDate(new Date()), []);
  const apiStartDate = startDate ? formatDate(startDate) : ALL_TIME_START;
  const apiEndDate = endDate ? formatDate(endDate) : today;

  const { data, isLoading, error } = useBudgetAnalysis(apiStartDate, apiEndDate);

  const contextValue = useMemo(
    () => ({ data, isLoading, error: error as Error | null }),
    [data, isLoading, error]
  );

  return (
    <AnalysisContext.Provider value={contextValue}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold">Budget Analysis</h1>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </div>
        <AnalysisTabBar />
        {children}
      </div>
    </AnalysisContext.Provider>
  );
}
