'use client';

import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  Filter,
  Group,
  GripVertical,
  LayoutGrid,
  Plus,
  SlidersHorizontal,
  Settings2,
  Table2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetPortal, SheetTitle } from '@/components/ui/sheet';
import { useIsMobileViewport } from '@/lib/hooks/use-is-mobile-viewport';
import type { DatabaseColumn } from './database-extension';
import { TYPE_META } from './db-cells';
import { DatabaseFilterPanel, FilterControl } from './database-filter-panel';
import { defaultFilterFor, isColumnFilterActive, type ColumnFilter } from './db-filter';
import type { DbDensity, DbSort, DbView } from '@/lib/pages/db-view';

/**
 * The collapsible database toolbar (v2). A resting header (collapse chevron +
 * editable title + a "Tools" toggle, with active Group/Sort/Filter shown as
 * removable chips while collapsed) that expands into the tools controls.
 *
 * On desktop, Tools expands into a single-baseline inline panel whose
 * Group/Sort/Properties are Radix popovers and whose Filter opens the portaled
 * `DatabaseFilterPanel`. On mobile (`useIsMobileViewport()`), Tools instead
 * opens a bottom `Sheet` with full-width, thumb-sized, stacked sections that
 * reuse the exact same picker *content* components. All state changes flow up
 * through callbacks; the toolbar owns only ephemeral open/closed UI flags.
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

  // Per-viewer, ephemeral UI flags — never persisted.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<HTMLButtonElement | null>(null);

  const groupCol = columns.find((c) => c.id === groupColId) ?? null;
  const sortCol = sort ? (columns.find((c) => c.id === sort.columnId) ?? null) : null;
  const activeFilterCols = columns.filter(
    (c) => filters[c.id] && isColumnFilterActive(filters[c.id])
  );
  const hiddenCount = hidden.filter((id) => id !== primaryColId).length;

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
        <button
          type="button"
          // On mobile the tools live in a bottom sheet that closes itself (its
          // own X / swipe / Esc), so this button only ever OPENS it. An open is
          // idempotent, which makes it immune to any residual WebKit
          // touch→click double-fire that would cancel a toggle and leave the
          // sheet shut ("Tools doesn't open"). Desktop keeps the toggle since
          // its inline panel has no separate close control.
          onClick={() => (isMobile ? setToolsOpen(true) : setToolsOpen((o) => !o))}
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
      </div>

      {restingChips}

      {/* Desktop: three fixed rows so the layout stays consistent regardless of
          view or selection: (1) view + density, (2) group/filter/sort,
          (3) properties + add. */}
      {!isMobile && toolsOpen && (
        <div className="bg-muted/20 border-border/60 mt-2.5 flex flex-col gap-2 rounded-xl border p-2">
          {/* Row 1 — view switcher + density */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="border-border/60 bg-card flex h-8 items-center gap-0.5 rounded-lg border p-[3px]">
              {VIEW_META.map(({ view: v, label, icon: Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onViewChange(v)}
                  className={cn(
                    'inline-flex h-[24px] items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
                    view === v
                      ? 'bg-muted text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {view === 'table' && (
              <div className="border-border/60 bg-card flex h-8 items-center gap-0.5 rounded-lg border p-[3px]">
                {(['airy', 'dense'] as DbDensity[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDensityChange(d)}
                    className={cn(
                      'h-[24px] rounded-md px-2.5 text-xs capitalize transition-colors',
                      density === d
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Row 2 — group / filter / sort */}
          <div className="flex flex-wrap items-center gap-2">
            <GroupPicker
              groupableCols={groupableCols}
              groupCol={groupCol}
              onGroupChange={onGroupChange}
            />
            <button
              ref={setFilterAnchor}
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
                activeFilterCols.length > 0
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 bg-card text-foreground hover:bg-muted/40'
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="text-muted-foreground">Filter</span>
              {activeFilterCols.length > 0 && (
                <span className="text-primary tabular-nums">{activeFilterCols.length}</span>
              )}
            </button>
            <SortPicker
              columns={columns}
              sort={sort}
              sortCol={sortCol}
              onSortChange={onSortChange}
            />
          </div>

          {/* Row 3 — properties + add column */}
          <div className="flex flex-wrap items-center gap-2">
            <PropertiesPopover
              view={view}
              columns={columns}
              primaryColId={primaryColId}
              hidden={hidden}
              onToggleHidden={onToggleHidden}
              onShowAll={onShowAll}
              hideEmptyCardFields={hideEmptyCardFields}
              onHideEmptyChange={onHideEmptyChange}
              hiddenCount={hiddenCount}
            />
          </div>
        </div>
      )}

      {!isMobile && filterOpen && (
        <DatabaseFilterPanel
          columns={columns}
          filters={filters}
          anchorEl={filterAnchor}
          onChange={onFilterChange}
          onClearAll={onClearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {isMobile && (
        <MobileToolsSheet
          open={toolsOpen}
          onClose={() => setToolsOpen(false)}
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
        />
      )}
    </div>
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

// ── Reusable picker content (shared by desktop popovers + mobile sheet) ──────

/**
 * The "Group by" option list (None + each groupable column, with a ✓ on the
 * active one). `onDone` closes the container (a popover on desktop; a no-op in
 * the always-expanded mobile section). `touch` enlarges rows for thumb taps.
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
 * view, which unmounts the whole tools sheet mid-interaction. Popover is
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
        className="max-h-[min(50vh,320px)] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
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
            unmounting this whole sheet mid-interaction. Same reason
            database-entry-sheet.tsx uses inline pills instead of a Select.
            Popover is non-modal by default, so it skips the scroll-lock. */}
        <DbFieldPicker
          label="Sort field"
          value={columns.find((c) => c.id === selectedId)?.name ?? 'Select…'}
          options={columns.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedId}
          onSelect={(id) => onSortChange({ columnId: id, dir })}
          triggerClassName={cn('border-border/60 bg-background flex-1', h, text)}
        />
        <div className={cn('bg-muted/40 inline-flex items-center rounded-lg p-0.5', h)}>
          <button
            type="button"
            onClick={() => onSortChange({ columnId: selectedId, dir: 'asc' })}
            aria-label="Ascending"
            className={cn(
              'flex items-center justify-center rounded-md transition-colors',
              touch ? 'h-10 w-11' : 'h-7 w-9',
              active && dir === 'asc'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSortChange({ columnId: selectedId, dir: 'desc' })}
            aria-label="Descending"
            className={cn(
              'flex items-center justify-center rounded-md transition-colors',
              touch ? 'h-10 w-11' : 'h-7 w-9',
              active && dir === 'desc'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
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
  /** Suppress the internal header: the mobile sheet's section card owns the
   *  title and hosts "Show all" as its action, so rendering both duplicates it. */
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
            // Match SheetSectionLabel in the mobile sheet; keep the tighter
            // desktop scale in the popover.
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

/** Group / board-column picker (single-select columns only). Desktop popover. */
function GroupPicker({
  groupableCols,
  groupCol,
  onGroupChange,
}: {
  groupableCols: DatabaseColumn[];
  groupCol: DatabaseColumn | null;
  onGroupChange: (colId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!groupCol;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
            active
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-card text-foreground hover:bg-muted/40'
          )}
        >
          <Group className="h-3.5 w-3.5" />
          <span className={active ? 'text-primary/80' : 'text-muted-foreground'}>Group</span>
          {groupCol && <span className="font-medium">{groupCol.name}</span>}
          {groupCol && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear grouping"
              onClick={(e) => {
                e.stopPropagation();
                onGroupChange(null);
                setOpen(false);
              }}
              className="opacity-70 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        <p className="text-muted-foreground px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
          Group by
        </p>
        <GroupPickerContent
          groupableCols={groupableCols}
          groupCol={groupCol}
          onGroupChange={onGroupChange}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Sort picker: field select + asc/desc segmented + clear. Desktop popover. */
function SortPicker({
  columns,
  sort,
  sortCol,
  onSortChange,
}: {
  columns: DatabaseColumn[];
  sort: DbSort | null;
  sortCol: DatabaseColumn | null;
  onSortChange: (sort: DbSort | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!sort;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
            active
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-card text-foreground hover:bg-muted/40'
          )}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span className={active ? 'text-primary/80' : 'text-muted-foreground'}>Sort</span>
          {sortCol && sort && (
            <span className="font-medium">
              {sortCol.name} {sort.dir === 'desc' ? '↓' : '↑'}
            </span>
          )}
          {sort && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear sort"
              onClick={(e) => {
                e.stopPropagation();
                onSortChange(null);
                setOpen(false);
              }}
              className="opacity-70 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="text-muted-foreground pb-2 text-[10px] font-semibold tracking-wider uppercase">
          Sort by
        </p>
        <SortPickerContent
          columns={columns}
          sort={sort}
          onSortChange={onSortChange}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Per-view show/hide-columns checklist + (Cards) hide-empty toggle. Desktop. */
function PropertiesPopover({
  view,
  columns,
  primaryColId,
  hidden,
  onToggleHidden,
  onShowAll,
  hideEmptyCardFields,
  onHideEmptyChange,
  hiddenCount,
}: {
  view: DbView;
  columns: DatabaseColumn[];
  primaryColId: string | null;
  hidden: string[];
  onToggleHidden: (colId: string) => void;
  onShowAll: () => void;
  hideEmptyCardFields: boolean;
  onHideEmptyChange: (value: boolean) => void;
  hiddenCount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
            open
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-card text-foreground hover:bg-muted/40'
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Properties
          {hiddenCount > 0 && (
            <span className="text-muted-foreground">· {columns.length - hiddenCount} shown</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(60vh,420px)] w-64 overflow-y-auto p-1.5">
        <PropertiesContent
          view={view}
          columns={columns}
          primaryColId={primaryColId}
          hidden={hidden}
          onToggleHidden={onToggleHidden}
          onShowAll={onShowAll}
          hideEmptyCardFields={hideEmptyCardFields}
          onHideEmptyChange={onHideEmptyChange}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Small pill toggle switch used in the Properties popover / sheet. */
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

/** Small uppercase section label for the mobile tools sheet. */
/**
 * Filter section for the mobile sheet: shows only the filters actually in use,
 * plus a picker to add one.
 *
 * It used to render a control for EVERY column unconditionally, which made this
 * one section taller than the whole sheet on a wide database and was the main
 * reason the panel read as an endless list. Note this is deliberately different
 * from the desktop popover, which still lists every column — there the panel is
 * a transient overlay with room to spare, whereas here it competes for a phone
 * screen with six other sections.
 *
 * `revealed` is local UI state, not a filter value: a freshly-added filter is
 * empty, and an empty filter is by definition inactive, so without tracking the
 * user's intent separately the row would vanish the instant it was added.
 */
function FilterSection({
  columns,
  filters,
  onFilterChange,
  onClearFilters,
}: {
  columns: DatabaseColumn[];
  filters: Record<string, ColumnFilter>;
  onFilterChange: (colId: string, next: ColumnFilter) => void;
  onClearFilters: () => void;
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
    <SheetSection
      title="Filter"
      action={
        anyActive ? (
          <button
            type="button"
            onClick={() => {
              onClearFilters();
              setRevealed([]);
            }}
            className="text-muted-foreground hover:text-foreground -my-2 px-2 py-2 text-sm"
          >
            Clear all
          </button>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <p className="text-muted-foreground mb-3 text-sm">No filters yet.</p>
      ) : (
        <div className="mb-3 space-y-3">
          {shown.map((col) => (
            <div key={col.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                {/* `span`, not `label`: FilterControl already supplies its own
                    aria-label, and an inline label shared a line with the
                    checkbox filter's inline-flex root. */}
                <span className="text-foreground/80 text-sm font-medium">{col.name}</span>
                <button
                  type="button"
                  onClick={() => removeFilter(col)}
                  aria-label={`Remove ${col.name} filter`}
                  className="text-muted-foreground hover:text-destructive -my-2 flex h-11 w-11 shrink-0 items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <FilterControl
                column={col}
                value={filters[col.id] ?? defaultFilterFor(col.type)}
                onChange={(next) => onFilterChange(col.id, next)}
                touch
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
          triggerClassName="border-border bg-background text-primary h-10 w-full text-sm"
          hideChevron
        />
      )}
    </SheetSection>
  );
}

/**
 * One section of the mobile tools sheet, as a discrete card.
 *
 * The sheet used to be a single flat `bg-card` surface with `space-y-6` gaps
 * and 11px uppercase micro-labels, which read as one long undifferentiated
 * list — gaps can't create division and micro-labels can't create hierarchy.
 * Each section is now a raised card on a recessed body, using the design
 * system's three-surface stack (background → card → secondary), with a real
 * title at body scale.
 */
function SheetSection({
  title,
  action,
  children,
}: {
  title: string;
  /** Optional right-aligned control on the title row (e.g. "Clear all"). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border/50 bg-card rounded-2xl border p-3">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Mobile bottom-sheet tools: full-width, thumb-sized, stacked sections that
 * reuse the same picker content components as the desktop popovers. All the
 * ephemeral view controls (view/density/group/sort/filter/properties) are
 * available to read-only viewers too (local overrides); only Add column is
 * gated on `editable`.
 */
function MobileToolsSheet({
  open,
  onClose,
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
}: {
  open: boolean;
  onClose: () => void;
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
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  return (
    <Sheet open={open} modal={false} onOpenChange={(o) => !o && onClose()}>
      {/* Our own scrim. Radix returns null for Dialog.Overlay when
          `modal={false}`, so the primitive's `bg-black/60 backdrop-blur-sm`
          never renders here — leaving the sheet sitting on an undimmed page at
          1.25:1 with nothing to signal a new layer arrived. `modal={false}` is
          load-bearing (see database-entry-sheet.tsx: a modal sheet runs
          react-remove-scroll, whose body mutation makes ProseMirror recreate
          the host NodeView mid-interaction), so we can't just flip it.
          `pointer-events-none` keeps this purely visual so it can't interfere
          with the onInteractOutside guards below. */}
      {open && (
        <SheetPortal>
          <div
            className="pointer-events-none fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            aria-hidden
          />
        </SheetPortal>
      )}
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          headerRef.current?.focus();
        }}
        className="border-border shadow-glow-lg flex max-h-[85dvh] flex-col gap-0 rounded-t-3xl border-t p-0"
      >
        {/* Grabber, and a real dismiss control rather than decoration: all three
            outside-interaction guards below are preventDefault()ed and the scrim
            is pointer-events-none, so without this the only way out is the
            primitive's 16px close icon. The visible pill stays 6px; the button
            around it carries the 44px target. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close view options"
          className="group focus-visible:ring-ring mx-auto flex h-11 w-16 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
        >
          {/* `bg-muted-foreground` (4.76:1 on the sheet), not `bg-border`
              (1.35:1): this pill is the visual affordance for the sheet's
              primary exit, so it has to clear the 3:1 non-text minimum. */}
          <span className="bg-muted-foreground/80 group-hover:bg-muted-foreground h-1.5 w-10 rounded-full transition-colors" />
        </button>
        {/* Focus lands on the heading, not the grabber. Radix would otherwise
            focus the first tabbable child — so the first thing announced inside
            the sheet was "Close view options" instead of what the sheet is. */}
        <SheetHeader
          ref={headerRef}
          tabIndex={-1}
          className="border-border/50 shrink-0 border-b px-4 py-3 outline-none"
        >
          <SheetTitle className="pr-10 text-left text-lg">View options</SheetTitle>
        </SheetHeader>

        {/* `safe-pb` goes on the scroller, not SheetContent, so the home-indicator
            inset becomes trailing scroll room instead of dead space under a
            clipped list. Base is driven via the CSS var because `.safe-pb` sets
            padding-bottom outright and `tailwind-merge` can't see it, so any
            `pb-*` here would silently lose. */}
        <div className="bg-background safe-pb flex-1 space-y-2 overflow-y-auto p-3 [--safe-pb-base:1.5rem]">
          <SheetSection title="View">
            <div className="border-border/60 bg-background grid grid-cols-3 gap-1 rounded-xl border p-1">
              {VIEW_META.map(({ view: v, label, icon: Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onViewChange(v)}
                  className={cn(
                    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors',
                    view === v
                      ? 'bg-primary/15 text-primary ring-primary/60 font-medium ring-1'
                      : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </SheetSection>

          {view === 'table' && (
            <SheetSection title="Density">
              <div className="border-border/60 bg-background grid grid-cols-2 gap-1 rounded-xl border p-1">
                {(['airy', 'dense'] as DbDensity[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDensityChange(d)}
                    className={cn(
                      'inline-flex min-h-10 items-center justify-center rounded-lg text-sm capitalize transition-colors',
                      density === d
                        ? 'bg-primary/15 text-primary ring-primary/60 font-medium ring-1'
                        : 'text-muted-foreground'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </SheetSection>
          )}

          <SheetSection title="Group by">
            <GroupPickerContent
              groupableCols={groupableCols}
              groupCol={groupCol}
              onGroupChange={onGroupChange}
              onDone={() => {}}
              touch
            />
          </SheetSection>

          <SheetSection title="Sort">
            <SortPickerContent
              columns={columns}
              sort={sort}
              onSortChange={onSortChange}
              onDone={() => {}}
              touch
            />
          </SheetSection>

          <FilterSection
            columns={columns}
            filters={filters}
            onFilterChange={onFilterChange}
            onClearFilters={onClearFilters}
          />

          <SheetSection
            title={view === 'table' ? 'Columns' : 'Card fields'}
            action={
              <button
                type="button"
                onClick={onShowAll}
                className="text-primary -my-2 px-2 py-2 text-sm hover:underline"
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
              touch
              hideTitle
            />
          </SheetSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
