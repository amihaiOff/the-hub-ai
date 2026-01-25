'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { type BudgetStatus, getBudgetStatus } from '@/lib/utils/budget';

interface CategoryProgressBarProps {
  budgeted: number;
  spent: number;
  className?: string;
  showDateIndicator?: boolean;
  showStats?: boolean;
  selectedMonth?: string; // YYYY-MM format - only show indicator for current month
}

/**
 * Compute date indicator position and month completion percentage
 * Returns null for both if not current month
 */
function computeMonthProgress(selectedMonth?: string): {
  indicatorPercent: number | null;
  monthPercent: number | null;
} {
  // Only run on client
  if (typeof window === 'undefined') return { indicatorPercent: null, monthPercent: null };

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Only show date indicator for current month
  if (selectedMonth && selectedMonth !== currentMonth) {
    return { indicatorPercent: null, monthPercent: null };
  }

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const percent = (dayOfMonth / daysInMonth) * 100;

  return { indicatorPercent: percent, monthPercent: percent };
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

  // Calculate date indicator position - memoize to avoid recalculating on every render
  const { indicatorPercent, monthPercent } = useMemo(
    () => computeMonthProgress(selectedMonth),
    [selectedMonth]
  );

  const shouldShowIndicator = showDateIndicator && indicatorPercent !== null;

  // Get color based on status
  const getBarColor = () => {
    switch (status) {
      case 'overspent':
        return 'bg-red-500';
      case 'funded':
        return 'bg-green-500';
      case 'underfunded':
        return 'bg-yellow-500';
      default:
        return 'bg-muted-foreground';
    }
  };

  // For zero budget with no spending, show empty bar
  if (budgeted === 0 && spent === 0) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div
          className="border-border/50 bg-muted/30 relative h-3 flex-1 rounded-full border"
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
        className="border-border/50 bg-muted/30 relative h-3 flex-1 rounded-full border"
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
    funded: { label: 'Funded', className: 'bg-green-500/10 text-green-500' },
    underfunded: { label: 'Underfunded', className: 'bg-yellow-500/10 text-yellow-500' },
    overspent: { label: 'Overspent', className: 'bg-red-500/10 text-red-500' },
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
