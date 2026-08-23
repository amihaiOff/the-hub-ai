'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarRange, FolderTree, LayoutGrid, Search, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { GroupBy } from './task-kanban-view';
import type { CalendarMode } from './task-calendar-view';

type ViewMode = 'list' | 'kanban' | 'table' | 'calendar' | 'carousel';

export interface ViewOption {
  id: ViewMode;
  label: string;
  icon: LucideIcon;
}

interface TaskToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  viewOptions: ViewOption[];
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  calendarView?: CalendarMode;
  onCalendarViewChange?: (value: CalendarMode) => void;
  onManageCategories?: () => void;
}

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'type', label: 'Type' },
  { id: 'category', label: 'Category' },
];

const CALENDAR_OPTIONS: { id: CalendarMode; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

type ActiveControl = 'search' | 'group' | 'calendar' | null;

/**
 * Toolbar layout: search + view-picker segmented control aligned left,
 * view-specific controls (kanban group, calendar mode) + manage-categories
 * aligned right. Wraps to a second row on narrow viewports.
 */
export function TaskToolbar({
  search,
  onSearchChange,
  view,
  onViewChange,
  viewOptions,
  groupBy,
  onGroupByChange,
  calendarView,
  onCalendarViewChange,
  onManageCategories,
}: TaskToolbarProps) {
  const [active, setActive] = useState<ActiveControl>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active === 'search') searchRef.current?.focus();
  }, [active]);

  const toggle = (control: Exclude<ActiveControl, null>) =>
    setActive((current) => (current === control ? null : control));

  const hasSearchTerm = search.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 py-0.5">
      {/* ── Left: search + always-visible view picker ──────────────────── */}
      <div className={cn('flex items-center', active === 'search' ? 'flex-1' : 'flex-none')}>
        <IconButton
          active={active === 'search' || hasSearchTerm}
          expanded={active === 'search'}
          label="Search"
          onClick={() => toggle('search')}
        >
          <Search className="h-4 w-4" />
        </IconButton>
        <div
          inert={active !== 'search'}
          className={cn(
            'flex items-center overflow-hidden rounded-2xl transition-all duration-200',
            active === 'search'
              ? 'border-border/60 bg-background ml-2 flex-1 border px-3 opacity-100'
              : 'w-0 px-0 opacity-0'
          )}
        >
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks, tags, or projects…"
            className="placeholder:text-muted-foreground h-11 w-full min-w-0 bg-transparent text-sm outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Segmented view picker — all four views always visible */}
      <div
        className="border-border/60 flex items-center gap-0.5 rounded-2xl border p-1"
        role="tablist"
        aria-label="View"
      >
        {viewOptions.map((opt) => {
          const Icon = opt.icon;
          const isActive = view === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => onViewChange(opt.id)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* ── Right: view-specific controls + manage categories ──────────── */}
      <div className="ml-auto flex items-center gap-2">
        {view === 'kanban' && (
          <PopoverControl
            open={active === 'group'}
            onOpenChange={(open) => setActive(open ? 'group' : null)}
            label="Group by"
            icon={<LayoutGrid className="h-4 w-4" />}
          >
            {GROUP_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.id}
                active={groupBy === opt.id}
                label={opt.label}
                wide
                onClick={() => {
                  onGroupByChange(opt.id);
                  setActive(null);
                }}
              >
                {opt.label}
              </OptionButton>
            ))}
          </PopoverControl>
        )}

        {view === 'calendar' && onCalendarViewChange && (
          <PopoverControl
            open={active === 'calendar'}
            onOpenChange={(open) => setActive(open ? 'calendar' : null)}
            label="Calendar view"
            icon={<CalendarRange className="h-4 w-4" />}
          >
            {CALENDAR_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.id}
                active={calendarView === opt.id}
                label={opt.label}
                wide
                onClick={() => {
                  onCalendarViewChange(opt.id);
                  setActive(null);
                }}
              >
                {opt.label}
              </OptionButton>
            ))}
          </PopoverControl>
        )}

        {onManageCategories && (
          <IconButton
            active={false}
            expanded={false}
            label="Manage categories"
            onClick={onManageCategories}
          >
            <FolderTree className="h-4 w-4" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  active,
  expanded,
  label,
  onClick,
  children,
}: {
  active: boolean;
  // Whether the control's content is currently revealed. These are disclosure
  // buttons, so we expose aria-expanded rather than aria-pressed.
  expanded: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/60 bg-background hover:bg-muted/60'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Icon button that opens its options in a Radix Popover positioned below.
 * The popover overlays surrounding content instead of pushing it — so the
 * toolbar never has to wrap when a control expands — and closes on any
 * outside click, Escape, or focus loss.
 */
function PopoverControl({
  open,
  onOpenChange,
  label,
  icon,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-expanded={open}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
            open
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-background hover:bg-muted/60'
          )}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="flex w-auto items-center gap-1 p-1">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function OptionButton({
  active,
  label,
  onClick,
  wide,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  wide?: boolean;
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
        'flex h-9 items-center justify-center gap-1.5 rounded-xl border text-xs whitespace-nowrap transition-colors',
        wide ? 'px-3' : 'w-9',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
