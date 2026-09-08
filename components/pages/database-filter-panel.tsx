'use client';

import { cn } from '@/lib/utils';
import type { DatabaseColumn } from './database-extension';
import { type ColumnFilter } from './db-filter';

const inputCls =
  'border-border bg-background focus:ring-primary/40 h-8 w-full rounded-lg border px-2 text-xs outline-none focus:ring-2';

/**
 * Touch-sized variant of `inputCls`.
 *
 * `text-base` is not cosmetic: iOS Safari force-zooms the page when an input
 * under 16px receives focus, so a 12px filter field made the whole layout jump
 * on tap. `h-11` meets the 44px minimum target.
 */
const inputTouchCls =
  'border-border bg-background focus:ring-primary/40 h-10 w-full min-w-0 rounded-lg border px-2.5 text-base outline-none focus:ring-2';

/**
 * A single column's type-appropriate filter control (text/number/date range,
 * select/multiselect pills, checkbox tri-state). Rendered inline in the tools
 * popover's Filter section.
 */
export function FilterControl({
  column,
  value,
  onChange,
  touch = false,
}: {
  column: DatabaseColumn;
  value: ColumnFilter;
  onChange: (next: ColumnFilter) => void;
  /** Render at touch sizes. Set by the mobile tools sheet; the desktop
   *  popover leaves it off. Mirrors the `touch` prop the sibling group/sort/
   *  properties pickers already take. */
  touch?: boolean;
}) {
  const fieldCls = touch ? inputTouchCls : inputCls;
  if (value.kind === 'text') {
    return (
      <input
        type="text"
        aria-label={`Filter ${column.name}`}
        value={value.query}
        placeholder="Contains…"
        onChange={(e) => onChange({ kind: 'text', query: e.target.value })}
        className={fieldCls}
      />
    );
  }

  if (value.kind === 'number') {
    const num = (s: string): number | null => (s === '' ? null : Number(s));
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="number"
          aria-label={`${column.name} minimum`}
          value={value.min ?? ''}
          placeholder="Min"
          onChange={(e) => onChange({ ...value, min: num(e.target.value) })}
          className={fieldCls}
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="number"
          aria-label={`${column.name} maximum`}
          value={value.max ?? ''}
          placeholder="Max"
          onChange={(e) => onChange({ ...value, max: num(e.target.value) })}
          className={fieldCls}
        />
      </div>
    );
  }

  if (value.kind === 'date') {
    const str = (s: string): string | null => (s === '' ? null : s);
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          type="date"
          aria-label={`${column.name} from`}
          value={value.min ?? ''}
          onChange={(e) => onChange({ ...value, min: str(e.target.value) })}
          className={fieldCls}
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="date"
          aria-label={`${column.name} to`}
          value={value.max ?? ''}
          onChange={(e) => onChange({ ...value, max: str(e.target.value) })}
          className={fieldCls}
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
      return (
        <p className={cn('text-muted-foreground', touch ? 'text-sm' : 'text-xs')}>No options.</p>
      );
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
                'rounded-full border transition-colors',
                touch ? 'min-h-9 px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs',
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
    <div
      className={cn(
        'border-border/60 inline-flex overflow-hidden rounded-lg border',
        touch ? 'text-sm' : 'text-xs'
      )}
    >
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange({ kind: 'checkbox', want: o.key })}
          className={cn(
            'transition-colors',
            touch ? 'min-h-10 px-3.5' : 'px-2.5 py-1',
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
