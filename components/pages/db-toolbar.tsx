'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  GripVertical,
  LayoutGrid,
  Plus,
  Settings2,
  Table2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobileViewport } from '@/lib/hooks/use-is-mobile-viewport';
import type { DatabaseColumn } from './database-extension';
import { TYPE_META } from './db-cells';
import { FilterControl } from './database-filter-panel';
import { defaultFilterFor, isColumnFilterActive, type ColumnFilter } from './db-filter';
import type { DbDensity, DbSort, DbView } from '@/lib/pages/db-view';

/**
 * The collapsible database toolbar (v2). A resting header (collapse chevron +
 * editable title + a "Tools" button, with active Group/Sort/Filter shown as
 * removable chips while collapsed).
 *
 * The Tools button opens ONE popover — the same on desktop and mobile — that
 * overlays the view (`DbToolsPanel`): each tool on its own line, an uppercase
 * title above a borderless control, hairline dividers between tools. Radix
 * Popover is non-modal, so it skips react-remove-scroll and can't recreate the
 * host NodeView the way the old modal bottom sheet could. All state changes
 * flow up through callbacks; the toolbar owns only the ephemeral open flag.
 */

interface DbToolbarProps {
  editable: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;

  view: DbView;
  onViewChange: (view: DbView) => void;
  density: DbDensity;
  onDensityChange: (density: DbDensity) => void;

  columns: DatabaseColumn[];
  primaryColId: string | null;
  groupableCols: DatabaseColumn[];
  /** The active group/board column for the current view (groupBy or kanbanBy). */
  groupColId: string | null;
  onGroupChange: (colId: string | null) => void;

  sort: DbSort | null;
  onSortChange: (sort: DbSort | null) => void;

  filters: Record<string, ColumnFilter>;
  onFilterChange: (colId: string, next: ColumnFilter) => void;
  onClearFilters: () => void;

  /** Hidden column ids for the current view. */
  hidden: string[];
  onToggleHidden: (colId: string) => void;
  onShowAll: () => void;

  /** Cards-only: hide empty fields toggle. */
  hideEmptyCardFields: boolean;
  onHideEmptyChange: (value: boolean) => void;
}

const VIEW_META: { view: DbView; label: string; icon: typeof Table2 }[] = [
  { view: 'table', label: 'Table', icon: Table2 },
  { view: 'cards', label: 'Cards', icon: LayoutGrid },
  { view: 'kanban', label: 'Kanban', icon: Columns3 },
];

export function DbToolbar(props: DbToolbarProps) {
  const {
    editable,
    title,
    onTitleChange,
    collapsed,
    onToggleCollapse,
    view,
    onViewChange,
    density,
    onDensityChange,
    columns,
    primaryColId,
    groupableCols,
    groupColId,
    onGroupChange,
    sort,
    onSortChange,
    filters,
    onFilterChange,
    onClearFilters,
    hidden,
    onToggleHidden,
    onShowAll,
    hideEmptyCardFields,
    onHideEmptyChange,
  } = props;

  const isMobile = useIsMobileViewport();

  // Per-viewer, ephemeral UI flag — never persisted.
  const [toolsOpen, setToolsOpen] = useState(false);

  const groupCol = columns.find((c) => c.id === groupColId) ?? null;
  const sortCol = sort ? (columns.find((c) => c.id === sort.columnId) ?? null) : null;
  const activeFilterCols = columns.filter(
    (c) => filters[c.id] && isColumnFilterActive(filters[c.id])
  );

  // ── Resting header ──────────────────────────────────────────────────────
  const restingChips =
    !toolsOpen && (groupCol || sortCol || activeFilterCols.length > 0) ? (
      <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2">
        {groupCol && (
          <StateChip
            label="Grouped"
            value={groupCol.name}
            editable={editable}
            onClear={() => onGroupChange(null)}
          />
        )}
        {sortCol && sort && (
          <StateChip
            label="Sort"
            value={`${sortCol.name} ${sort.dir === 'desc' ? '↓' : '↑'}`}
            editable={editable}
            onClear={() => onSortChange(null)}
          />
        )}
        {activeFilterCols.map((c) => (
          <StateChip
            key={c.id}
            label="Filter"
            value={c.name}
            editable={editable}
            onClear={() => onFilterChange(c.id, defaultFilterFor(c.type))}
          />
        ))}
      </div>
    ) : null;

  return (
    <div className="px-1 pt-2">
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand database' : 'Collapse database'}
          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {editable ? (
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Untitled"
            dir="auto"
            aria-label="Database title"
            className="text-foreground placeholder:text-muted-foreground/40 min-w-0 flex-1 truncate bg-transparent text-base font-semibold outline-none"
          />
        ) : (
          <span className="text-foreground min-w-0 flex-1 truncate text-base font-semibold">
            {title || 'Untitled'}
          </span>
        )}
        <Popover open={toolsOpen} onOpenChange={setToolsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Tools"
              title="Tools"
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
                toolsOpen
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground border-transparent'
              )}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          {/* One popover stemming from the Tools button, overlaying the view.
              Same content on desktop and mobile — Radix Popover is non-modal, so
              it skips react-remove-scroll and can't recreate the host NodeView
              the way the old modal sheet could. `touch` only relaxes sizing. */}
          <PopoverContent
            align="end"
            sideOffset={6}
            className="themed-scroll max-h-[min(70vh,520px)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto p-1"
          >
            <DbToolsPanel
              view={view}
              onViewChange={onViewChange}
              density={density}
              onDensityChange={onDensityChange}
              columns={columns}
              primaryColId={primaryColId}
              groupableCols={groupableCols}
              groupCol={groupCol}
              onGroupChange={onGroupChange}
              sort={sort}
              onSortChange={onSortChange}
              filters={filters}
              onFilterChange={onFilterChange}
              onClearFilters={onClearFilters}
              hidden={hidden}
              onToggleHidden={onToggleHidden}
              onShowAll={onShowAll}
              hideEmptyCardFields={hideEmptyCardFields}
              onHideEmptyChange={onHideEmptyChange}
              touch={isMobile}
            />
          </PopoverContent>
        </Popover>
      </div>

      {restingChips}
    </div>
  );
}

/**
 * The unified tools panel rendered inside the Tools popover (desktop + mobile).
 * Each tool sits on its own line: an uppercase title above a borderless control,
 * with hairline dividers between tools so they stay distinguishable. The popover
 * itself supplies the surface (border + bg + shadow); the controls do not repeat
 * it. `touch` relaxes control sizing for phones.
 */
function DbToolsPanel({
  view,
  onViewChange,
  density,
  onDensityChange,
  columns,
  primaryColId,
  groupableCols,
  groupCol,
  onGroupChange,
  sort,
  onSortChange,
  filters,
  onFilterChange,
  onClearFilters,
  hidden,
  onToggleHidden,
  onShowAll,
  hideEmptyCardFields,
  onHideEmptyChange,
  touch,
}: {
  view: DbView;
  onViewChange: (view: DbView) => void;
  density: DbDensity;
  onDensityChange: (density: DbDensity) => void;
  columns: DatabaseColumn[];
  primaryColId: string | null;
  groupableCols: DatabaseColumn[];
  groupCol: DatabaseColumn | null;
  onGroupChange: (colId: string | null) => void;
  sort: DbSort | null;
  onSortChange: (sort: DbSort | null) => void;
  filters: Record<string, ColumnFilter>;
  onFilterChange: (colId: string, next: ColumnFilter) => void;
  onClearFilters: () => void;
  hidden: string[];
  onToggleHidden: (colId: string) => void;
  onShowAll: () => void;
  hideEmptyCardFields: boolean;
  onHideEmptyChange: (value: boolean) => void;
  touch: boolean;
}) {
  const segH = touch ? 'h-10' : 'h-9';
  return (
    <div>
      <ToolSection title="View">
        <div className="flex gap-1">
          {VIEW_META.map(({ view: v, label, icon: Icon }) => (
            <SegButton
              key={v}
              selected={view === v}
              className={segH}
              onClick={() => onViewChange(v)}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </SegButton>
          ))}
        </div>
      </ToolSection>

      {view === 'table' && (
        <ToolSection title="Density">
          <div className="flex gap-1">
            {(['airy', 'dense'] as DbDensity[]).map((d) => (
              <SegButton
                key={d}
                selected={density === d}
                className={cn(segH, 'capitalize')}
                onClick={() => onDensityChange(d)}
              >
                {d}
              </SegButton>
            ))}
          </div>
        </ToolSection>
      )}

      <ToolSection title="Group by">
        <GroupPickerContent
          groupableCols={groupableCols}
          groupCol={groupCol}
          onGroupChange={onGroupChange}
          onDone={() => {}}
          touch={touch}
        />
      </ToolSection>

      <ToolSection title="Sort">
        <SortPickerContent
          columns={columns}
          sort={sort}
          onSortChange={onSortChange}
          onDone={() => {}}
          touch={touch}
        />
      </ToolSection>

      <ToolFilterSection
        columns={columns}
        filters={filters}
        onFilterChange={onFilterChange}
        onClearFilters={onClearFilters}
        touch={touch}
      />

      <ToolSection
        title={view === 'table' ? 'Columns' : 'Card fields'}
        action={
          <button
            type="button"
            onClick={onShowAll}
            className="text-primary text-[11.5px] hover:underline"
          >
            Show all
          </button>
        }
      >
        <PropertiesContent
          view={view}
          columns={columns}
          primaryColId={primaryColId}
          hidden={hidden}
          onToggleHidden={onToggleHidden}
          onShowAll={onShowAll}
          hideEmptyCardFields={hideEmptyCardFields}
          onHideEmptyChange={onHideEmptyChange}
          touch={touch}
          hideTitle
        />
      </ToolSection>
    </div>
  );
}

/**
 * One tool row in the popover: an uppercase title (optionally with a right-side
 * action) above its control. A hairline top border on every section but the
 * first keeps adjacent tools visually distinct without boxing each in a card.
 */
function ToolSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border/50 px-1.5 py-2.5 [&:not(:first-child)]:border-t">
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
        <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Borderless segmented-control button (View / Density). Active = faint tint. */
function SegButton({
  selected,
  className,
  onClick,
  children,
}: {
  selected: boolean;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] transition-colors',
        selected
          ? 'bg-primary/15 text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

/** A removable chip shown in the resting header for an active tool. */
function StateChip({
  label,
  value,
  editable,
  onClear,
}: {
  label: string;
  value: string;
  editable: boolean;
  onClear: () => void;
}) {
  return (
    <span className="bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-2.5 text-[11.5px]">
      {label} <b className="text-foreground font-medium">{value}</b>
      {editable && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className="hover:text-foreground opacity-70 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// ── Reusable picker content (the tools popover's sections) ──────────────────

/**
 * The "Group by" option list (None + each groupable column, with a ✓ on the
 * active one). `onDone` fires after a pick (a no-op in the always-expanded tools
 * popover section). `touch` enlarges rows for thumb taps.
 */
function GroupPickerContent({
  groupableCols,
  groupCol,
  onGroupChange,
  onDone,
  touch = false,
}: {
  groupableCols: DatabaseColumn[];
  groupCol: DatabaseColumn | null;
  onGroupChange: (colId: string | null) => void;
  onDone: () => void;
  touch?: boolean;
}) {
  return (
    <>
      <PickerRow
        selected={!groupCol}
        label="None"
        touch={touch}
        onClick={() => {
          onGroupChange(null);
          onDone();
        }}
      />
      {groupableCols.map((c) => (
        <PickerRow
          key={c.id}
          selected={groupCol?.id === c.id}
          label={c.name}
          touch={touch}
          onClick={() => {
            onGroupChange(c.id);
            onDone();
          }}
        />
      ))}
      {groupableCols.length === 0 && (
        <p className={cn('text-muted-foreground px-2 py-2', touch ? 'text-sm' : 'text-xs')}>
          No select columns to group by.
        </p>
      )}
    </>
  );
}

/**
 * A field picker styled like the rest of the app, opening below its trigger.
 *
 * Built on Popover rather than Radix Select on purpose: Select wraps its
 * dropdown in react-remove-scroll unconditionally, and that body scroll-lock
 * makes ProseMirror recreate the host database NodeView while it's in Table
 * view, which unmounts the whole tools popover mid-interaction. Popover is
 * non-modal by default and skips the scroll-lock. `database-entry-sheet.tsx`
 * documents the same hazard and dodges it with inline pills.
 */
function DbFieldPicker({
  label,
  value,
  options,
  selectedId,
  onSelect,
  triggerClassName,
  leadingIcon,
  hideChevron = false,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  triggerClassName?: string;
  leadingIcon?: React.ReactNode;
  hideChevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'focus-visible:ring-ring flex items-center justify-between gap-2 rounded-lg border px-2.5 outline-none focus-visible:ring-2',
            triggerClassName
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {leadingIcon}
            <span className="truncate">{value}</span>
          </span>
          {!hideChevron && (
            <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      {/* Below the trigger, matching the app's other popovers. Collision
          detection stays on, so it flips up when the trigger sits near the
          viewport edge rather than rendering off-screen. */}
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="themed-scroll max-h-[min(50vh,320px)] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
      >
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              onSelect(opt.id);
              setOpen(false);
            }}
            className={cn(
              'hover:bg-muted/50 flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm',
              opt.id === selectedId ? 'text-primary font-medium' : 'text-foreground'
            )}
          >
            <span className="truncate">{opt.name}</span>
            {opt.id === selectedId && <Check className="h-4 w-4 shrink-0" aria-hidden />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Sort field picker + asc/desc segmented + Clear sort. */
function SortPickerContent({
  columns,
  sort,
  onSortChange,
  onDone,
  touch = false,
}: {
  columns: DatabaseColumn[];
  sort: DbSort | null;
  onSortChange: (sort: DbSort | null) => void;
  onDone: () => void;
  touch?: boolean;
}) {
  const active = !!sort;
  const dir = sort?.dir ?? 'asc';
  const selectedId = sort?.columnId ?? columns[0]?.id ?? '';
  const h = touch ? 'h-10' : 'h-8';
  const text = touch ? 'text-sm' : 'text-xs';
  return (
    <>
      <div className="flex items-center gap-2">
        {/* Popover, NOT Radix Select. Select wraps its dropdown in
            react-remove-scroll unconditionally, and that body scroll-lock makes
            ProseMirror recreate the host database NodeView in Table view —
            unmounting this whole tools popover mid-interaction. Same reason
            database-entry-sheet.tsx uses inline pills instead of a Select.
            Popover is non-modal by default, so it skips the scroll-lock. */}
        <DbFieldPicker
          label="Sort field"
          value={columns.find((c) => c.id === selectedId)?.name ?? 'Select…'}
          options={columns.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedId}
          onSelect={(id) => onSortChange({ columnId: id, dir })}
          triggerClassName={cn('hover:bg-muted/40 flex-1 border-0 px-2', h, text)}
        />
        <div className={cn('inline-flex items-center gap-0.5', h)}>
          {(['asc', 'desc'] as const).map((d) => {
            const Icon = d === 'asc' ? ArrowUp : ArrowDown;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onSortChange({ columnId: selectedId, dir: d })}
                aria-label={d === 'asc' ? 'Ascending' : 'Descending'}
                className={cn(
                  'flex items-center justify-center rounded-lg transition-colors',
                  touch ? 'h-10 w-11' : 'h-8 w-9',
                  active && dir === d
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>
      {sort && (
        <button
          type="button"
          onClick={() => {
            onSortChange(null);
            onDone();
          }}
          className={cn(
            'text-muted-foreground hover:bg-muted/40 hover:text-foreground mt-1 w-full rounded-lg px-2 text-left',
            touch ? 'py-2 text-sm' : 'py-1.5 text-xs'
          )}
        >
          Clear sort
        </button>
      )}
    </>
  );
}

/** Per-view show/hide-columns checklist + (Cards) hide-empty toggle. */
function PropertiesContent({
  view,
  columns,
  primaryColId,
  hidden,
  onToggleHidden,
  onShowAll,
  hideEmptyCardFields,
  onHideEmptyChange,
  touch = false,
  hideTitle = false,
}: {
  view: DbView;
  columns: DatabaseColumn[];
  primaryColId: string | null;
  hidden: string[];
  onToggleHidden: (colId: string) => void;
  onShowAll: () => void;
  hideEmptyCardFields: boolean;
  onHideEmptyChange: (value: boolean) => void;
  touch?: boolean;
  /** Suppress the internal header: the enclosing ToolSection owns the title and
   *  hosts "Show all" as its action, so rendering both would duplicate it. */
  hideTitle?: boolean;
}) {
  const hiddenSet = new Set(hidden);
  const title = view === 'table' ? 'Columns' : 'Card fields';
  return (
    <>
      <div
        className={cn('flex items-center justify-between px-1.5 pt-1 pb-2', hideTitle && 'hidden')}
      >
        <span
          className={cn(
            'text-muted-foreground font-semibold tracking-wider uppercase',
            // Fallback header when rendered without an enclosing ToolSection;
            // slightly larger on touch.
            touch ? 'text-[11px]' : 'text-[10px]'
          )}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={onShowAll}
          className={cn(
            'text-primary hover:underline',
            touch ? 'min-h-11 px-2 text-sm' : 'text-[11.5px]'
          )}
        >
          Show all
        </button>
      </div>
      {columns.map((col) => {
        const locked = col.id === primaryColId;
        const on = locked || !hiddenSet.has(col.id);
        const Icon = TYPE_META[col.type].icon;
        return (
          <button
            key={col.id}
            type="button"
            disabled={locked}
            onClick={() => !locked && onToggleHidden(col.id)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors',
              touch ? 'min-h-10 py-2 text-sm' : 'py-1.5 text-[13px]',
              locked ? 'cursor-default opacity-60' : 'hover:bg-muted/50'
            )}
          >
            {/* Desktop only: nothing wires up reorder here, and a grip that
                doesn't grip is worse on touch where it invites a drag. */}
            {!touch && (
              <GripVertical className="text-muted-foreground/50 h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <Icon className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className={cn('flex-1 truncate', !on && 'text-muted-foreground')}>
              {col.name}
            </span>
            {locked ? (
              <span className="text-muted-foreground text-[11px]">title</span>
            ) : (
              <Toggle on={on} />
            )}
          </button>
        );
      })}
      {view === 'cards' && (
        <div className="border-border/40 mt-1 border-t px-1 pt-2 pb-1">
          <button
            type="button"
            onClick={() => onHideEmptyChange(!hideEmptyCardFields)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-1 text-left',
              touch ? 'min-h-11 py-2 text-sm' : 'py-1 text-[12.5px]'
            )}
          >
            <Toggle on={hideEmptyCardFields} />
            <span>Hide empty fields</span>
          </button>
        </div>
      )}
    </>
  );
}

/** Small pill toggle switch used in the Properties section. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors',
        on ? 'bg-primary' : 'bg-muted'
      )}
      aria-hidden
    >
      <span
        className={cn(
          'absolute top-0.5 h-[14px] w-[14px] rounded-full transition-all',
          on ? 'bg-primary-foreground left-[14px]' : 'bg-muted-foreground left-0.5'
        )}
      />
    </span>
  );
}

function PickerRow({
  selected,
  label,
  onClick,
  touch = false,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  touch?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'hover:bg-muted/60 flex w-full items-center justify-between rounded-md text-left',
        touch ? 'min-h-11 px-3 py-2.5 text-sm' : 'px-2 py-1.5 text-xs',
        selected ? 'text-primary' : 'text-foreground'
      )}
    >
      {label}
      {selected && <span className="text-primary">✓</span>}
    </button>
  );
}

/**
 * Filter tool: shows only the filters actually in use, plus an "Add filter"
 * picker — deliberately not a control per column, which could dwarf every other
 * tool on a wide database. `revealed` tracks a freshly-added-but-still-empty
 * filter so its row doesn't vanish before the user types anything (an empty
 * filter is inactive by definition).
 */
function ToolFilterSection({
  columns,
  filters,
  onFilterChange,
  onClearFilters,
  touch,
}: {
  columns: DatabaseColumn[];
  filters: Record<string, ColumnFilter>;
  onFilterChange: (colId: string, next: ColumnFilter) => void;
  onClearFilters: () => void;
  touch: boolean;
}) {
  const [revealed, setRevealed] = useState<string[]>([]);
  const isActive = (col: DatabaseColumn) => {
    const f = filters[col.id];
    return !!f && isColumnFilterActive(f);
  };
  const shown = columns.filter((col) => isActive(col) || revealed.includes(col.id));
  const addable = columns.filter((col) => !shown.some((c) => c.id === col.id));
  const anyActive = columns.some(isActive);
  const removeFilter = (col: DatabaseColumn) => {
    onFilterChange(col.id, defaultFilterFor(col.type));
    setRevealed((prev) => prev.filter((id) => id !== col.id));
  };
  return (
    <ToolSection
      title="Filter"
      action={
        anyActive ? (
          <button
            type="button"
            onClick={() => {
              onClearFilters();
              setRevealed([]);
            }}
            className="text-muted-foreground hover:text-foreground text-[11.5px]"
          >
            Clear all
          </button>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <p className="text-muted-foreground mb-2 text-xs">No filters yet.</p>
      ) : (
        <div className="mb-2 space-y-2.5">
          {shown.map((col) => (
            <div key={col.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                {/* `span`, not `label`: FilterControl supplies its own aria-label. */}
                <span className="text-foreground/80 text-xs font-medium">{col.name}</span>
                <button
                  type="button"
                  onClick={() => removeFilter(col)}
                  aria-label={`Remove ${col.name} filter`}
                  className="text-muted-foreground hover:text-destructive -my-1 flex h-8 w-8 shrink-0 items-center justify-center"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <FilterControl
                column={col}
                value={filters[col.id] ?? defaultFilterFor(col.type)}
                onChange={(next) => onFilterChange(col.id, next)}
                touch={touch}
              />
            </div>
          ))}
        </div>
      )}

      {addable.length > 0 && (
        <DbFieldPicker
          label="Add filter"
          value="Add filter"
          leadingIcon={<Plus className="h-4 w-4" />}
          options={addable.map((col) => ({ id: col.id, name: col.name }))}
          selectedId={null}
          onSelect={(id) => setRevealed((prev) => [...prev, id])}
          triggerClassName={cn(
            'text-primary hover:bg-muted/40 w-full border-0 px-1',
            touch ? 'h-10 text-sm' : 'h-9 text-xs'
          )}
          hideChevron
        />
      )}
    </ToolSection>
  );
}
