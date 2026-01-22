'use client';

import { cn } from '@/lib/utils';
import { type BudgetStatus, getBudgetStatus } from '@/lib/utils/budget';

interface CategoryProgressBarProps {
  budgeted: number;
  spent: number;
  className?: string;
}

export function CategoryProgressBar({ budgeted, spent, className }: CategoryProgressBarProps) {
  const status = getBudgetStatus(budgeted, spent);

  // Calculate spent percentage (capped at 100% for display)
  const spentPercent = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0;

  // For zero budget with no spending, show empty bar
  if (budgeted === 0 && spent === 0) {
    return (
      <div className={cn('bg-muted h-2 w-full rounded-full', className)}>
        <div className="h-full w-0 rounded-full" />
      </div>
    );
  }

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

  return (
    <div className={cn('bg-muted h-2 w-full rounded-full', className)}>
      <div
        className={cn('h-full rounded-full transition-all', getBarColor())}
        style={{ width: `${spentPercent}%` }}
      />
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
