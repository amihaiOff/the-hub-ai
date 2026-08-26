'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { DatabaseColumn } from './database-extension';
import { defaultFilterFor, isColumnFilterActive, type ColumnFilter } from './db-filter';

interface DatabaseFilterPanelProps {
  columns: DatabaseColumn[];
  /** Active filters keyed by column id (only active ones are present). */
  filters: Record<string, ColumnFilter>;
  /** The trigger button — excluded from outside-click so it can toggle closed. */
  anchorEl?: HTMLElement | null;
  onChange: (colId: string, next: ColumnFilter) => void;
  onClearAll: () => void;
  onClose: () => void;
}

/**
 * Dropdown panel listing every column with a type-appropriate filter control.
 * Rendered inline (absolutely positioned) beneath the toolbar's Filter button.
 * Filter state lives in the block's ephemeral view state — nothing is persisted.
 */
export function DatabaseFilterPanel({
  columns,
  filters,
  anchorEl,
  onChange,
  onClearAll,
  onClose,
}: DatabaseFilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape. The trigger button is excluded so its own
  // click toggles the panel closed instead of racing this handler (mousedown
  // close → click reopen).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorEl]);

  const anyActive = Object.values(filters).some(isColumnFilterActive);

  return (
    <div
      ref={ref}
      // max-w accounts for the block's pl-9 (2.25rem) indent plus a small gutter
      // so the panel never spills past the right edge on a ~320px screen.
      // Mobile: fixed 18rem width capped by viewport so the panel never
      // spills past the right edge on a ~320px screen. Desktop: fit
      // content so date-range pairs / wider controls aren't clipped or
      // horizontally-scrolled. `lg:w-max` + `lg:max-w-[36rem]` gives
      // room for two side-by-side date inputs without runaway growth.
      className="border-border bg-card absolute top-full left-0 z-30 mt-1 w-72 max-w-[calc(100vw-4.5rem)] rounded-xl border p-3 shadow-lg lg:w-max lg:max-w-[36rem]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Filter
        </span>
        {anyActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Vertical scroll only when the mobile viewport gets tight; desktop
          drops the cap so the panel expands to fit its content. */}
      <div className="max-h-[50vh] space-y-3 overflow-y-auto lg:max-h-none lg:overflow-visible">
        {columns.map((col) => (
          <div key={col.id} className="space-y-1">
            <label className="text-foreground/80 text-xs font-medium">{col.name}</label>
            <FilterControl
              column={col}
              value={filters[col.id] ?? defaultFilterFor(col.type)}
              onChange={(next) => onChange(col.id, next)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const inputCls =
  'border-border bg-background focus:ring-primary/40 h-8 w-full rounded-lg border px-2 text-xs outline-none focus:ring-2';

function FilterControl({
  column,
  value,
  onChange,
}: {
  column: DatabaseColumn;
  value: ColumnFilter;
  onChange: (next: ColumnFilter) => void;
}) {
  if (value.kind === 'text') {
    return (
      <input
        type="text"
        aria-label={`Filter ${column.name}`}
        value={value.query}
        placeholder="Contains…"
        onChange={(e) => onChange({ kind: 'text', query: e.target.value })}
        className={inputCls}
      />
    );
  }

  if (value.kind === 'number') {
    const num = (s: string): number | null => (s === '' ? null : Number(s));
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          aria-label={`${column.name} minimum`}
          value={value.min ?? ''}
          placeholder="Min"
          onChange={(e) => onChange({ ...value, min: num(e.target.value) })}
          className={inputCls}
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="number"
          aria-label={`${column.name} maximum`}
          value={value.max ?? ''}
          placeholder="Max"
          onChange={(e) => onChange({ ...value, max: num(e.target.value) })}
          className={inputCls}
        />
      </div>
    );
  }

  if (value.kind === 'date') {
    const str = (s: string): string | null => (s === '' ? null : s);
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          aria-label={`${column.name} from`}
          value={value.min ?? ''}
          onChange={(e) => onChange({ ...value, min: str(e.target.value) })}
          className={inputCls}
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="date"
          aria-label={`${column.name} to`}
          value={value.max ?? ''}
          onChange={(e) => onChange({ ...value, max: str(e.target.value) })}
          className={inputCls}
        />
      </div>
    );
  }

  if (value.kind === 'select' || value.kind === 'multiselect') {
    const kind = value.kind;
    const options = column.options ?? [];
    const toggle = (optId: string) => {
      const has = value.optionIds.includes(optId);
      onChange({
        kind,
        optionIds: has ? value.optionIds.filter((o) => o !== optId) : [...value.optionIds, optId],
      });
    };
    if (options.length === 0) {
      return <p className="text-muted-foreground text-xs">No options.</p>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const on = value.optionIds.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs transition-colors',
                on
                  ? 'border-primary/50 bg-primary/15 text-primary'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/50'
              )}
            >
              {opt.label || 'Untitled'}
            </button>
          );
        })}
      </div>
    );
  }

  // checkbox
  const opts: { key: 'any' | 'checked' | 'unchecked'; label: string }[] = [
    { key: 'any', label: 'Any' },
    { key: 'checked', label: 'Checked' },
    { key: 'unchecked', label: 'Unchecked' },
  ];
  return (
    <div className="border-border/60 inline-flex overflow-hidden rounded-lg border text-xs">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange({ kind: 'checkbox', want: o.key })}
          className={cn(
            'px-2.5 py-1 transition-colors',
            value.want === o.key
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted/50'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
