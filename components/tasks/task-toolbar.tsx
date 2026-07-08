'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarRange, FolderTree, LayoutGrid, Search, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GroupBy } from './task-kanban-view';
import type { CalendarMode } from './task-calendar-view';

type ViewMode = 'list' | 'kanban' | 'table' | 'calendar';

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
  { id: 'category', label: 'Category' },
];

const CALENDAR_OPTIONS: { id: CalendarMode; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

type ActiveControl = 'search' | 'view' | 'group' | 'calendar' | null;

/**
 * A single-line, accordion-style toolbar. Each control (Search, View,
 * Group by) is normally a compact icon button; tapping one expands it to
 * the side and collapses whichever control was open before. Choosing an
 * option (a view or a grouping) collapses the control again.
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

  // Focus the search field the moment it expands.
  useEffect(() => {
    if (active === 'search') searchRef.current?.focus();
  }, [active]);

  const toggle = (control: Exclude<ActiveControl, null>) =>
    setActive((current) => (current === control ? null : control));

  const ActiveViewIcon = viewOptions.find((o) => o.id === view)?.icon ?? viewOptions[0].icon;
  const hasSearchTerm = search.trim().length > 0;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-0.5">
      {/* Search — expands to fill the remaining space on the line. Icon and
          input are grouped so the collapsed input doesn't add a second gap.
          Stays highlighted while a term is active even after it collapses, so
          a filtered list always has a visible cause. */}
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

      {/* View type */}
      <ExpandingControl
        active={active === 'view'}
        onToggle={() => toggle('view')}
        label="View"
        icon={<ActiveViewIcon className="h-4 w-4" />}
      >
        {viewOptions.map((opt) => {
          const Icon = opt.icon;
          return (
            <OptionButton
              key={opt.id}
              active={view === opt.id}
              label={opt.label}
              onClick={() => {
                onViewChange(opt.id);
                setActive(null);
              }}
            >
              <Icon className="h-4 w-4" />
            </OptionButton>
          );
        })}
      </ExpandingControl>

      {/* Manage categories — sits alongside the other icon buttons so
          all task controls line up on the left side of the toolbar. */}
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

      {/* Group by — only affects the Kanban view, so hide it elsewhere */}
      {view === 'kanban' && (
        <ExpandingControl
          active={active === 'group'}
          onToggle={() => toggle('group')}
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
        </ExpandingControl>
      )}

      {/* Calendar view (week / month) — only shown for the Calendar view */}
      {view === 'calendar' && onCalendarViewChange && (
        <ExpandingControl
          active={active === 'calendar'}
          onToggle={() => toggle('calendar')}
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
        </ExpandingControl>
      )}
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

/** An icon button that reveals a row of options to its side when active. */
function ExpandingControl({
  active,
  onToggle,
  label,
  icon,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-none items-center">
      <IconButton active={active} expanded={active} label={label} onClick={onToggle}>
        {icon}
      </IconButton>
      <div
        inert={!active}
        className={cn(
          'flex items-center gap-1 overflow-hidden transition-all duration-200',
          active ? 'ml-1 max-w-[280px] opacity-100' : 'max-w-0 opacity-0'
        )}
      >
        {children}
      </div>
    </div>
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
