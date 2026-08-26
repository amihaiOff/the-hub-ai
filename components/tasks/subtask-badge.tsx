import { ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small "this task has sub-tasks" indicator for task cards: a hierarchy icon
 * plus a count. Renders nothing when count is 0. Callers pass whatever count
 * matches their view (the app convention is open/not-done sub-tasks).
 */
export function SubtaskBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  const label = `${count} sub-task${count === 1 ? '' : 's'}`;
  return (
    <span
      className={cn(
        'text-muted-foreground inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums',
        className
      )}
      title={label}
      aria-label={label}
    >
      <ListTree className="h-3.5 w-3.5" aria-hidden />
      {count}
    </span>
  );
}
