'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { type BudgetStatus, getBudgetStatus } from '@/lib/utils/budget';
import { getCurrentCycleMonth } from '@/lib/utils/billing-cycle';
import { useBillingCycleStartDay } from '@/lib/hooks/use-budget';

interface CategoryProgressBarProps {
  budgeted: number;
  spent: number;
  className?: string;
  showDateIndicator?: boolean;
  showStats?: boolean;
  selectedMonth?: string; // YYYY-MM format - only show indicator for current month
}

/**
 * Percent of the current billing cycle elapsed (today counts as a full day),
 * or null when `selectedMonth` isn't the current cycle. With startDay=10 the
 * cycle runs from the 10th through the 9th of the next month.
 */
export function cycleProgressPercent(
  now: Date,
  startDay: number,
  selectedMonth?: string
): number | null {
  const current = getCurrentCycleMonth(now, startDay);
  if (selectedMonth && selectedMonth !== current) return null;
  const [y, m] = current.split('-').map(Number);
  const start = new Date(y, m - 1, startDay);
  const end = new Date(y, m, startDay);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const DAY = 86_400_000;
  // Math.round absorbs DST hour shifts
  const elapsed = Math.round((today.getTime() - start.getTime()) / DAY) + 1;
  const total = Math.round((end.getTime() - start.getTime()) / DAY);
  return (elapsed / total) * 100;
}

export function CategoryProgressBar({
  budgeted,
  spent,
  className,
  showDateIndicator = true,
  showStats = true,
  selectedMonth,
}: CategoryProgressBarProps) {
  const status = getBudgetStatus(budgeted, spent);

  // Calculate spent percentage (capped at 100% for display, but show real % in stats)
  const spentPercent = budgeted > 0 ? (spent / budgeted) * 100 : 0;
  const displaySpentPercent = Math.min(spentPercent, 100);

  const startDay = useBillingCycleStartDay();
  // Client-only (avoids hydration mismatch on the date)
  const indicatorPercent = useMemo(
    () =>
      typeof window === 'undefined'
        ? null
        : cycleProgressPercent(new Date(), startDay, selectedMonth),
    [selectedMonth, startDay]
  );
  const monthPercent = indicatorPercent;

  const shouldShowIndicator = showDateIndicator && indicatorPercent !== null;

  // Get color based on status
  const getBarColor = () => {
    switch (status) {
      case 'overspent':
        return 'bg-[#f5a5a5]';
      case 'funded':
        return 'bg-[#a8caff]';
      case 'underfunded':
        return 'bg-[#a8caff]';
      default:
        return 'bg-muted-foreground';
    }
  };

  // For zero budget with no spending, show empty bar
  if (budgeted === 0 && spent === 0) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div
          className="border-border bg-secondary relative h-3 flex-1 rounded-full border"
          role="progressbar"
          aria-valuenow={0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="No budget set"
        >
          <div className="h-full w-0 rounded-full" />
          {shouldShowIndicator && (
            <div
              className="bg-foreground/50 absolute top-0 h-full w-0.5"
              style={{ left: `${indicatorPercent}%` }}
            />
          )}
        </div>
        {showStats && (
          <div className="text-muted-foreground flex w-16 shrink-0 flex-col items-end text-xs tabular-nums">
            <span>0%</span>
            {monthPercent !== null && (
              <span className="text-muted-foreground/60">{Math.round(monthPercent)}% mo</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="border-border bg-secondary relative h-3 flex-1 rounded-full border"
        role="progressbar"
        aria-valuenow={Math.round(spentPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(spentPercent)}% of budget spent`}
      >
        <div
          className={cn('h-full rounded-full transition-all', getBarColor())}
          style={{ width: `${displaySpentPercent}%` }}
        />
        {shouldShowIndicator && (
          <div
            className="bg-foreground/50 absolute top-0 h-full w-0.5"
            style={{ left: `${indicatorPercent}%` }}
          />
        )}
      </div>
      {showStats && (
        <div className="flex w-16 shrink-0 flex-col items-end text-xs tabular-nums">
          <span className={cn(status === 'overspent' ? 'text-red-500' : 'text-foreground')}>
            {Math.round(spentPercent)}%
          </span>
          {monthPercent !== null && (
            <span className="text-muted-foreground/60">{Math.round(monthPercent)}% mo</span>
          )}
        </div>
      )}
    </div>
  );
}

// Status badge for displaying the status with color
interface StatusBadgeProps {
  status: BudgetStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig = {
    funded: { label: 'Funded', className: 'bg-[#a8caff]/10 text-[#a8caff]' },
    underfunded: { label: 'Underfunded', className: 'bg-[#a8caff]/10 text-[#a8caff]' },
    overspent: { label: 'Overspent', className: 'bg-[#f5a5a5]/10 text-[#f5a5a5]' },
    zero: { label: 'No Budget', className: 'bg-muted text-muted-foreground' },
  };

  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
