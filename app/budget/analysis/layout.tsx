'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  useBudgetAnalysis,
  useBillingCycleSettings,
  type AnalysisData,
} from '@/lib/hooks/use-budget';
import { getCurrentCycleMonth } from '@/lib/utils/billing-cycle';
import {
  AnalysisPeriodPicker,
  type AnalysisSelection,
} from '@/components/budget/analysis/analysis-period-picker';

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
  const { startDay, isLoading: settingsLoading } = useBillingCycleSettings();
  // Default to the current billing month (same anchor as the rest of the
  // budget). `null` means "use the default"; once the user picks, that wins.
  const [override, setOverride] = useState<AnalysisSelection | null>(null);
  const selection: AnalysisSelection = override ?? {
    type: 'month',
    month: getCurrentCycleMonth(new Date(), startDay),
  };

  const today = useMemo(() => formatDate(new Date()), []);
  // Month mode → payment-method-aware single month; range → calendar span;
  // all → everything. The hook ignores start/end when a month is passed.
  const apiMonth = selection.type === 'month' ? selection.month : undefined;
  const apiStartDate = selection.type === 'range' ? formatDate(selection.start) : ALL_TIME_START;
  const apiEndDate = selection.type === 'range' ? formatDate(selection.end) : today;

  // Hold the fetch until the billing-cycle start day is known, but only for the
  // derived default month — otherwise the placeholder start day (1) would fetch
  // the wrong month first and refetch once the real value arrives. An explicit
  // user selection doesn't depend on the start day, so it fetches immediately.
  const deferring = override === null && settingsLoading;
  const { data, isLoading, error } = useBudgetAnalysis(apiStartDate, apiEndDate, apiMonth, {
    enabled: !deferring,
  });

  const contextValue = useMemo(
    () => ({ data, isLoading: deferring || isLoading, error: error as Error | null }),
    [data, isLoading, deferring, error]
  );

  return (
    <AnalysisContext.Provider value={contextValue}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="page-title text-5xl font-bold tracking-tight lg:text-6xl">
            Budget Analysis
          </h1>
          <AnalysisPeriodPicker value={selection} onChange={setOverride} />
        </div>
        {children}
      </div>
    </AnalysisContext.Provider>
  );
}
