'use client';

import { useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useBillingCycleSettings,
  useBudgetReport,
  useBudgetReports,
  useGenerateBudgetReport,
} from '@/lib/hooks/use-budget';
import { lastClosedMonth } from '@/lib/budget-report/compute';
import { formatMonth } from '@/lib/utils/budget';
import { ReportView } from '@/components/budget/report/report-view';
import { SharePdfButton } from '@/components/budget/report/share-pdf-button';

export default function BudgetReportsPage() {
  const { startDay, isLoading: settingsLoading } = useBillingCycleSettings();
  const { data: reports, isLoading: listLoading } = useBudgetReports();
  const generate = useGenerateBudgetReport();
  const [picked, setPicked] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const latestClosed = settingsLoading ? null : lastClosedMonth(new Date(), startDay);
  // Months with a report, plus the latest closed cycle so it can be generated.
  const months = useMemo(() => {
    const set = new Set((reports ?? []).map((r) => r.month));
    if (latestClosed) set.add(latestClosed);
    return [...set].sort().reverse();
  }, [reports, latestClosed]);
  const month = picked ?? reports?.[0]?.month ?? latestClosed;
  const listed = reports?.find((r) => r.month === month);
  const { data: report, isLoading: reportLoading } = useBudgetReport(listed ? month : null);

  const busy = generate.isPending || report?.status === 'generating';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="page-title text-4xl font-bold tracking-tight">Reports</h1>
        <div className="flex flex-wrap items-start gap-2" data-pdf-hide>
          <Select value={month ?? undefined} onValueChange={setPicked} disabled={!months.length}>
            <SelectTrigger className="w-44" aria-label="Report month">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {report && (
            <SharePdfButton
              targetRef={reportRef}
              fileName={`budget-report-${report.month}.pdf`}
              title={`Budget report — ${formatMonth(report.month)}`}
            />
          )}
        </div>
      </div>

      {(listLoading || reportLoading || settingsLoading) && (
        <div className="flex justify-center py-12">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      )}

      {!listLoading && !settingsLoading && month && !listed && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p>
              No report for {formatMonth(month)} yet. Reports are created automatically on the 12th;
              you can also create one now.
            </p>
            <Button onClick={() => generate.mutate(month)} disabled={generate.isPending}>
              {generate.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Generate report
            </Button>
            {generate.error && <p className="text-destructive text-sm">{generate.error.message}</p>}
          </CardContent>
        </Card>
      )}

      {report && (
        <div ref={reportRef} className="bg-background flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-medium">{formatMonth(report.month)}</h2>
            <div className="flex flex-col items-end gap-1" data-pdf-hide>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => generate.mutate(report.month)}
                disabled={busy}
              >
                <RefreshCw className={busy ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />
                Regenerate
              </Button>
              {generate.error && (
                <p className="text-destructive text-xs">{generate.error.message}</p>
              )}
            </div>
          </div>
          <ReportView data={report} />
        </div>
      )}
    </div>
  );
}
