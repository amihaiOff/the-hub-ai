'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TaskFilters } from '@/lib/validations/tasks';
import type { TaskCategoryRow, TaskTagRow } from '@/lib/hooks/use-tasks';
import { TASK_STATUSES, TASK_PRIORITIES } from '@/lib/validations/tasks';

interface TaskFiltersBarProps {
  filters: TaskFilters;
  onFiltersChange: (next: TaskFilters) => void;
  categories: TaskCategoryRow[];
  tags: TaskTagRow[];
}

const ANY = '__any__';

/**
 * Filter chips + search. Values omitted from the emitted object when set
 * to "any" so the URL / server never sees stray query params.
 */
export function TaskFiltersBar({
  filters,
  onFiltersChange,
  categories,
  tags,
}: TaskFiltersBarProps) {
  const setValue = <K extends keyof TaskFilters>(key: K, value: TaskFilters[K] | undefined) => {
    const next: TaskFilters = { ...filters };
    if (value == null || value === '') delete next[key];
    else next[key] = value;
    onFiltersChange(next);
  };

  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search…"
        value={filters.search ?? ''}
        onChange={(e) => setValue('search', e.target.value || undefined)}
        className="h-8 w-full max-w-xs text-sm"
      />

      <FilterSelect
        placeholder="Status"
        value={filters.status ?? ANY}
        onChange={(v) => setValue('status', v === ANY ? undefined : (v as TaskFilters['status']))}
        options={[
          { value: ANY, label: 'Any status' },
          ...TASK_STATUSES.map((s) => ({ value: s, label: prettyStatus(s) })),
        ]}
      />

      <FilterSelect
        placeholder="Priority"
        value={filters.priority ?? ANY}
        onChange={(v) =>
          setValue('priority', v === ANY ? undefined : (v as TaskFilters['priority']))
        }
        options={[
          { value: ANY, label: 'Any priority' },
          ...TASK_PRIORITIES.map((p) => ({ value: p, label: prettyPriority(p) })),
        ]}
      />

      <FilterSelect
        placeholder="Category"
        value={filters.categoryId ?? ANY}
        onChange={(v) => setValue('categoryId', v === ANY ? undefined : v)}
        options={[
          { value: ANY, label: 'Any category' },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      <FilterSelect
        placeholder="Tag"
        value={filters.tagId ?? ANY}
        onChange={(v) => setValue('tagId', v === ANY ? undefined : v)}
        options={[
          { value: ANY, label: 'Any tag' },
          ...tags.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onFiltersChange({})} className="h-8">
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[110px] text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function prettyStatus(s: string): string {
  switch (s) {
    case 'TODO':
      return 'To do';
    case 'IN_PROGRESS':
      return 'In progress';
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
