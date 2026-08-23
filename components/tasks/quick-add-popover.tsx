'use client';

import { useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskCategoryRow, TaskRow } from '@/lib/hooks/use-tasks';
import { PRIORITY_BORDER, TYPE_META } from './task-list-view';
import { TASK_TYPES } from '@/lib/validations/tasks';
import { prettyType } from './task-filters-bar';

type Priority = TaskRow['priority'];
// Nullable on purpose — unlike the `TaskType` exported from validations, a
// quick-add task may be created with no type at all.
type NullableTaskType = TaskRow['type'];

/** Options the quick-add form collects alongside the title. */
export interface QuickAddOptions {
  categoryId: string | null;
  priority: Priority;
  /** Work-mode, or null when the user leaves it unset. */
  type: NullableTaskType;
  /** ISO date-only string (`YYYY-MM-DDT00:00:00.000Z`) or null. */
  dueDate: string | null;
}

const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: 'URGENT', label: 'Urgent' },
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' },
];

/** Short "Mon D" label for the due-date chip from a `YYYY-MM-DD` string. */
function formatShortDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

interface QuickAddPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TaskCategoryRow[];
  /** Fired when the user submits — parent creates the task. */
  onSubmit: (title: string, opts: QuickAddOptions) => void;
  isSubmitting?: boolean;
  /** Pre-select a category (e.g. when adding from a kanban category column). */
  initialCategoryId?: string | null;
  /** Pre-select a priority (e.g. when adding from a kanban priority column). */
  initialPriority?: Priority;
  /** Pre-select a type (e.g. when adding from a kanban type column). */
  initialType?: NullableTaskType;
  /** Popover placement relative to the anchor. Defaults to the FAB layout. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /** The button (or other element) this popover anchors to. */
  children: React.ReactNode;
}

/**
 * Compact "quick add" popover that opens above the floating action
 * button on a short press. The title area is a textarea with
 * `field-sizing:content` so it wraps and grows as the user types. A
 * small category dropdown sits next to the submit button in the
 * footer.
 */
export function QuickAddPopover({
  open,
  onOpenChange,
  categories,
  onSubmit,
  isSubmitting = false,
  initialCategoryId,
  initialPriority,
  initialType,
  side = 'top',
  align = 'end',
  children,
}: QuickAddPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={12}
        collisionPadding={12}
        className="w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border p-3 shadow-xl"
        onOpenAutoFocus={(e) => {
          // Radix's default focus target scrolls itself into view, which
          // on some layouts (fixed FAB near the viewport edge) yanks the
          // page down. We prevent the default focus and re-focus the
          // textarea ourselves with preventScroll so the page stays put.
          e.preventDefault();
          const target = e.target as HTMLElement | null;
          const textarea = target?.querySelector('textarea') as HTMLTextAreaElement | null;
          textarea?.focus({ preventScroll: true });
        }}
      >
        {/* Inner form is only mounted while the popover is open, so
            leaving/reopening resets state without an effect. */}
        <QuickAddForm
          categories={categories}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
          initialCategoryId={initialCategoryId ?? null}
          initialPriority={initialPriority ?? 'MEDIUM'}
          initialType={initialType ?? null}
        />
      </PopoverContent>
    </Popover>
  );
}

function QuickAddForm({
  categories,
  onSubmit,
  onCancel,
  isSubmitting,
  initialCategoryId,
  initialPriority,
  initialType,
}: {
  categories: TaskCategoryRow[];
  onSubmit: (title: string, opts: QuickAddOptions) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  initialCategoryId: string | null;
  initialPriority: Priority;
  initialType: NullableTaskType;
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [priority, setPriority] = useState<Priority>(initialPriority);
  const [type, setType] = useState<NullableTaskType>(initialType);
  // Date-only string 'YYYY-MM-DD' from the native picker, or null.
  const [dueDate, setDueDate] = useState<string | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;
    onSubmit(trimmed, {
      categoryId,
      priority,
      type,
      // Store date-only as midnight UTC — matches the detail sheet / calendar.
      dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : null,
    });
  };

  const selectedCategory = categoryId ? categories.find((c) => c.id === categoryId) : null;
  const openDatePicker = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  };

  return (
    <>
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={1}
        placeholder="What needs doing?"
        className={cn(
          'placeholder:text-muted-foreground [field-sizing:content]',
          'min-h-8 w-full resize-none overflow-hidden',
          'bg-transparent text-sm leading-snug break-words outline-none'
        )}
      />

      {/* Footer: category / priority / type / due-date pickers on the left,
          submit on the right. The pickers wrap on narrow widths; submit stays
          put. */}
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {/* Category */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Choose category"
                title={selectedCategory?.name ?? 'No category'}
                className={cn(
                  'border-border/60 hover:bg-muted/60 flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                  selectedCategory ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <span className="max-w-[7rem] truncate">
                  {selectedCategory?.name ?? 'Category'}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="rounded-2xl">
              <DropdownMenuItem
                className={cn('rounded-lg text-sm', categoryId === null && 'bg-muted font-medium')}
                onSelect={() => setCategoryId(null)}
              >
                No category
              </DropdownMenuItem>
              {categories.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  className={cn(
                    'rounded-lg text-sm',
                    categoryId === c.id && 'bg-muted font-medium'
                  )}
                  onSelect={() => setCategoryId(c.id)}
                >
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority (urgency) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Choose urgency"
                title={`Urgency: ${priority}`}
                className="border-border/60 hover:bg-muted/60 text-foreground flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-xs transition-colors"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: PRIORITY_BORDER[priority] }}
                />
                <span>{PRIORITY_OPTIONS.find((p) => p.id === priority)?.label}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="rounded-2xl">
              {PRIORITY_OPTIONS.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  className={cn(
                    'gap-2 rounded-lg text-sm',
                    priority === p.id && 'bg-muted font-medium'
                  )}
                  onSelect={() => setPriority(p.id)}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: PRIORITY_BORDER[p.id] }}
                  />
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Type (work-mode) — optional, so the list carries a "No type" reset */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Choose type"
                title={type ? `Type: ${prettyType(type)}` : 'No type'}
                className={cn(
                  'border-border/60 hover:bg-muted/60 flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                  type ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {type && (
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', TYPE_META[type].dot)} />
                )}
                <span>{type ? prettyType(type) : 'Type'}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="rounded-2xl">
              <DropdownMenuItem
                className={cn('rounded-lg text-sm', type === null && 'bg-muted font-medium')}
                onSelect={() => setType(null)}
              >
                No type
              </DropdownMenuItem>
              {TASK_TYPES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  className={cn('gap-2 rounded-lg text-sm', type === t && 'bg-muted font-medium')}
                  onSelect={() => setType(t)}
                >
                  <span className={cn('h-2 w-2 rounded-full', TYPE_META[t].dot)} />
                  {prettyType(t)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Due date */}
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={openDatePicker}
              aria-label={dueDate ? `Due date: ${formatShortDate(dueDate)}` : 'Set due date'}
              title={dueDate ? `Due ${formatShortDate(dueDate)}` : 'Set due date'}
              className={cn(
                'border-border/60 hover:bg-muted/60 flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                dueDate ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {dueDate && <span>{formatShortDate(dueDate)}</span>}
            </button>
            {dueDate && (
              <button
                type="button"
                onClick={() => setDueDate(null)}
                aria-label="Clear due date"
                className="text-muted-foreground hover:text-foreground ml-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {/* Native picker: kept in the DOM (not display:none) so showPicker()
                works; visually collapsed under the button. */}
            <input
              ref={dateRef}
              type="date"
              value={dueDate ?? ''}
              onChange={(e) => setDueDate(e.target.value || null)}
              tabIndex={-1}
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || isSubmitting}
          aria-label="Create task"
          className={cn(
            'bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform',
            'hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100'
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </>
  );
}
