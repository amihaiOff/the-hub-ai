'use client';

import { useState } from 'react';
import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskFilters } from '@/lib/validations/tasks';
import type { TaskCategoryRow, TaskTagRow } from '@/lib/hooks/use-tasks';
import { TASK_PRIORITIES } from '@/lib/validations/tasks';

export type TaskSort = 'due-asc' | 'due-desc' | 'priority' | 'title' | 'created';

interface TaskFiltersBarProps {
  filters: TaskFilters;
  onFiltersChange: (next: TaskFilters) => void;
  sort: TaskSort;
  onSortChange: (next: TaskSort) => void;
  categories: TaskCategoryRow[];
  tags: TaskTagRow[];
}

const SORT_OPTIONS: { id: TaskSort; label: string }[] = [
  { id: 'due-asc', label: 'Due date · earliest first' },
  { id: 'due-desc', label: 'Due date · latest first' },
  { id: 'priority', label: 'Priority · high first' },
  { id: 'title', label: 'Title · A–Z' },
  { id: 'created', label: 'Recently created' },
];

/**
 * Search + icon-only Filter/Sort. The Filter icon toggles an expandable
 * chip row where the user picks status / priority / category / tag. The
 * Sort icon is a dropdown of preset orderings.
 */
export function TaskFiltersBar({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  categories,
  tags,
}: TaskFiltersBarProps) {
  const [expanded, setExpanded] = useState(false);
  const activeFilterCount = countActive(filters);

  const setValue = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K] | undefined) => {
    const next: TaskFilters = { ...filters };
    if (value == null || value === '') delete next[key];
    else next[key] = value;
    onFiltersChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Search + icon buttons */}
      <div className="flex items-center gap-2">
        <div className="border-border/60 bg-background flex h-11 flex-1 items-center gap-2 rounded-2xl border px-4">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" />
          <input
            value={filters.search ?? ''}
            onChange={(e) => setValue('search', e.target.value || undefined)}
            placeholder="Search tasks, tags, or projects…"
            className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setValue('search', undefined)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <IconToggle
          active={expanded || activeFilterCount > 0}
          onClick={() => setExpanded((v) => !v)}
          label="Filter"
          badge={activeFilterCount || undefined}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </IconToggle>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Sort"
              title="Sort"
              className="border-border/60 bg-background hover:bg-muted/60 flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SORT_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.id}
                onSelect={() => onSortChange(opt.id)}
                className={cn('rounded-lg text-sm', sort === opt.id && 'bg-muted font-medium')}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filter chip row — only visible when expanded or something's active */}
      {(expanded || activeFilterCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <ChipSelect
            label="Priority"
            value={filters.priority}
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: prettyPriority(p) }))}
            onChange={(v) => setValue('priority', v as TaskFilters['priority'])}
          />
          <ChipSelect
            label="Category"
            value={filters.categoryId}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(v) => setValue('categoryId', v)}
          />
          <ChipSelect
            label="Tag"
            value={filters.tagId}
            options={tags.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(v) => setValue('tagId', v)}
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => onFiltersChange({})}
              className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IconToggle({
  active,
  onClick,
  label,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/60 bg-background hover:bg-muted/60'
      )}
    >
      {children}
      {badge ? (
        <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ChipSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | undefined) => void;
}) {
  const selected = value ? options.find((o) => o.value === value) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
            selected
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="font-medium">{label}</span>
          {selected && <span className="opacity-70">· {selected.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="rounded-2xl">
        <DropdownMenuItem
          onSelect={() => onChange(undefined)}
          className={cn('rounded-lg text-sm', !value && 'bg-muted font-medium')}
        >
          Any {label.toLowerCase()}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={() => onChange(opt.value)}
            className={cn('rounded-lg text-sm', value === opt.value && 'bg-muted font-medium')}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function countActive(filters: TaskFilters): number {
  let n = 0;
  if (filters.status) n++;
  if (filters.priority) n++;
  if (filters.categoryId) n++;
  if (filters.tagId) n++;
  return n;
}

export function prettyStatus(s: string): string {
  switch (s) {
    case 'TODO':
      return 'To Do';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'BLOCKED':
      return 'Blocked';
    case 'DONE':
      return 'Done';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return s;
  }
}

export function prettyPriority(p: string): string {
  switch (p) {
    case 'URGENT':
      return 'Urgent';
    case 'HIGH':
      return 'High';
    case 'MEDIUM':
      return 'Medium';
    case 'LOW':
      return 'Low';
    default:
      return p;
  }
}
