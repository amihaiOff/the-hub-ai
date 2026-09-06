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
import type { DatabaseColumn } from './database-extension';
import { TYPE_META } from './db-cells';
import { DatabaseFilterPanel } from './database-filter-panel';
import {
  defaultFilterFor,
  isColumnFilterActive,
  type ColumnFilter,
} from './db-filter';
import type { DbDensity, DbSort, DbView } from '@/lib/pages/db-view';

/**
 * The collapsible database toolbar (v2). A resting header (collapse chevron +
 * editable title + a "Tools" toggle, with active Group/Sort/Filter shown as
 * removable chips while collapsed) that expands into a single-baseline tools
 * row: view switcher · density (Table only) · Group/Filter/Sort · Properties ·
 * Add column. All state changes flow up through callbacks; the toolbar owns only
 * ephemeral open/closed UI flags.
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

  // Per-viewer, ephemeral UI flags — never persisted.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<HTMLButtonElement | null>(null);

  const groupCol = columns.find((c) => c.id === groupColId) ?? null;
  const sortCol = sort ? columns.find((c) => c.id === sort.columnId) ?? null : null;
  const activeFilterCols = columns.filter(
    (c) => filters[c.id] && isColumnFilterActive(filters[c.id])
  );
  const hiddenCount = hidden.filter((id) => id !== primaryColId).length;

  // ── Resting header ──────────────────────────────────────────────────────
  const restingChips =
    !toolsOpen &&
    (groupCol || sortCol || activeFilterCols.length > 0) ? (
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
          onClick={() => setToolsOpen((o) => !o)}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] transition-colors',
            toolsOpen
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <Settings2 className="h-4 w-4" /> Tools
        </button>
      </div>

      {restingChips}

      {toolsOpen && (
        <div className="bg-muted/20 border-border/60 scrollbar-hide mt-2.5 flex flex-nowrap items-center gap-2.5 overflow-x-auto rounded-xl border p-2">
          {/* View switcher */}
          <div className="border-border/60 bg-card flex h-8 shrink-0 items-center gap-0.5 rounded-lg border p-[3px]">
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
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="bg-border h-5 w-px shrink-0" aria-hidden />

          {/* Density (Table only) */}
          {view === 'table' && (
            <div className="border-border/60 bg-card flex h-8 shrink-0 items-center gap-0.5 rounded-lg border p-[3px]">
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

          {/* Group · Filter · Sort */}
          <div className="flex shrink-0 items-center gap-1.5">
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
            <SortPicker columns={columns} sort={sort} sortCol={sortCol} onSortChange={onSortChange} />
          </div>

          <div className="min-w-3 flex-1" aria-hidden />

          {/* Properties + Add column */}
          <div className="flex shrink-0 items-center gap-1.5">
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

      {filterOpen && (
        <DatabaseFilterPanel
          columns={columns}
          filters={filters}
          anchorEl={filterAnchor}
          onChange={onFilterChange}
          onClearAll={onClearFilters}
          onClose={() => setFilterOpen(false)}
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

/** Group / board-column picker (single-select columns only). */
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
        <PickerRow selected={!groupCol} label="None" onClick={() => { onGroupChange(null); setOpen(false); }} />
        {groupableCols.map((c) => (
          <PickerRow
            key={c.id}
            selected={groupCol?.id === c.id}
            label={c.name}
            onClick={() => {
              onGroupChange(c.id);
              setOpen(false);
            }}
          />
        ))}
        {groupableCols.length === 0 && (
          <p className="text-muted-foreground px-2 py-2 text-xs">No select columns to group by.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Sort picker: field select + asc/desc segmented + clear. */
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
  const dir = sort?.dir ?? 'asc';
  const selectedId = sort?.columnId ?? columns[0]?.id ?? '';
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
        <div className="flex items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => onSortChange({ columnId: e.target.value, dir })}
            className="border-border/60 bg-background focus:ring-primary/40 h-8 flex-1 rounded-lg border px-2 text-xs outline-none focus:ring-2"
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="bg-muted/40 inline-flex h-8 items-center rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onSortChange({ columnId: selectedId, dir: 'asc' })}
              aria-label="Ascending"
              className={cn(
                'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
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
                'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
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
              setOpen(false);
            }}
            className="text-muted-foreground hover:bg-muted/40 hover:text-foreground mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs"
          >
            Clear sort
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Per-view show/hide-columns checklist + (Cards) hide-empty toggle. */
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
  const hiddenSet = new Set(hidden);
  const title = view === 'table' ? 'Columns' : 'Card fields';
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
            <span className="text-muted-foreground">
              · {columns.length - hiddenCount} shown
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(60vh,420px)] w-64 overflow-y-auto p-1.5">
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
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
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
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-[12.5px]"
            >
              <Toggle on={hideEmptyCardFields} />
              <span>Hide empty fields</span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Small pill toggle switch used in the Properties popover. */
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
          on ? 'left-[14px] bg-primary-foreground' : 'bg-muted-foreground left-0.5'
        )}
      />
    </span>
  );
}

function PickerRow({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'hover:bg-muted/60 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
        selected ? 'text-primary' : 'text-foreground'
      )}
    >
      {label}
      {selected && <span className="text-primary">✓</span>}
    </button>
  );
}
