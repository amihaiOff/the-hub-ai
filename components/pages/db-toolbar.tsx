'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

  onAddColumn: () => void;
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
    onAddColumn,
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
            {editable && view === 'table' && (
              <button
                type="button"
                onClick={onAddColumn}
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add column
              </button>
            )}
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
          editable={editable}
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
          activeFilterCols={activeFilterCols}
          hidden={hidden}
          onToggleHidden={onToggleHidden}
          onShowAll={onShowAll}
          hideEmptyCardFields={hideEmptyCardFields}
          onHideEmptyChange={onHideEmptyChange}
          onAddColumn={onAddColumn}
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

/** Sort field `<select>` + asc/desc segmented + Clear sort. */
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
  const h = touch ? 'h-11' : 'h-8';
  const text = touch ? 'text-sm' : 'text-xs';
  return (
    <>
      <div className="flex items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => onSortChange({ columnId: e.target.value, dir })}
          aria-label="Sort field"
          className={cn(
            'border-border/60 bg-background focus:ring-primary/40 flex-1 rounded-lg border px-2 outline-none focus:ring-2',
            h,
            text
          )}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
            touch ? 'py-2.5 text-sm' : 'py-1.5 text-xs'
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
}) {
  const hiddenSet = new Set(hidden);
  const title = view === 'table' ? 'Columns' : 'Card fields';
  return (
    <>
      <div className="flex items-center justify-between px-1.5 pt-1 pb-2">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          {title}
        </span>
        <button
          type="button"
          onClick={onShowAll}
          className="text-primary text-[11.5px] hover:underline"
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
              touch ? 'min-h-11 py-2.5 text-sm' : 'py-1.5 text-[13px]',
              locked ? 'cursor-default opacity-60' : 'hover:bg-muted/50'
            )}
          >
            <GripVertical className="text-muted-foreground/50 h-3.5 w-3.5 shrink-0" aria-hidden />
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
function SheetSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
      {children}
    </p>
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
  editable,
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
  activeFilterCols,
  hidden,
  onToggleHidden,
  onShowAll,
  hideEmptyCardFields,
  onHideEmptyChange,
  onAddColumn,
}: {
  open: boolean;
  onClose: () => void;
  editable: boolean;
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
  activeFilterCols: DatabaseColumn[];
  hidden: string[];
  onToggleHidden: (colId: string) => void;
  onShowAll: () => void;
  hideEmptyCardFields: boolean;
  onHideEmptyChange: (value: boolean) => void;
  onAddColumn: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0"
      >
        <SheetHeader className="border-border/40 border-b p-4">
          <SheetTitle className="text-left text-base">View options</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* View */}
          <section>
            <SheetSectionLabel>View</SheetSectionLabel>
            <div className="border-border/60 bg-card grid grid-cols-3 gap-1 rounded-xl border p-1">
              {VIEW_META.map(({ view: v, label, icon: Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onViewChange(v)}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors',
                    view === v ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Density (table only) */}
          {view === 'table' && (
            <section>
              <SheetSectionLabel>Density</SheetSectionLabel>
              <div className="border-border/60 bg-card grid grid-cols-2 gap-1 rounded-xl border p-1">
                {(['airy', 'dense'] as DbDensity[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDensityChange(d)}
                    className={cn(
                      'inline-flex min-h-11 items-center justify-center rounded-lg text-sm capitalize transition-colors',
                      density === d
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Group by */}
          <section>
            <SheetSectionLabel>Group by</SheetSectionLabel>
            <GroupPickerContent
              groupableCols={groupableCols}
              groupCol={groupCol}
              onGroupChange={onGroupChange}
              onDone={() => {}}
              touch
            />
          </section>

          {/* Sort */}
          <section>
            <SheetSectionLabel>Sort</SheetSectionLabel>
            <SortPickerContent
              columns={columns}
              sort={sort}
              onSortChange={onSortChange}
              onDone={() => {}}
              touch
            />
          </section>

          {/* Filter */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SheetSectionLabel>Filter</SheetSectionLabel>
              {activeFilterCols.length > 0 && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-3">
              {columns.map((col) => (
                <div key={col.id} className="space-y-1">
                  <label className="text-foreground/80 text-sm font-medium">{col.name}</label>
                  <FilterControl
                    column={col}
                    value={filters[col.id] ?? defaultFilterFor(col.type)}
                    onChange={(next) => onFilterChange(col.id, next)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Properties */}
          <section>
            <SheetSectionLabel>Properties</SheetSectionLabel>
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
            />
          </section>

          {/* Add column (editable + table only) */}
          {editable && view === 'table' && (
            <section>
              <button
                type="button"
                onClick={onAddColumn}
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" /> Add column
              </button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
