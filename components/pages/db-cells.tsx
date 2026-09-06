'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Baseline, Calendar, Check, ChevronDown, Hash, Menu as MenuIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, parseISO, isValid } from 'date-fns';
import type { DatabaseCellValue, DatabaseColumn, DatabaseColumnType } from './database-extension';

/**
 * Shared cell primitives for the Areas database block (v2): the color palette
 * for select options, per-type icons, value coercion, the in-table editable
 * `CellEditor`, and a read-only `CellValueDisplay` used by the Cards / Kanban
 * views. Split out of `database-block.tsx` so the (Table/Cards/Kanban) views and
 * the row entry sheet all render cells identically without importing the whole
 * NodeView. None of this touches the columns/rows storage shape.
 */

// Type icons are drawn muted — a monochrome iconography row keeps the eye on the
// column names, not on chromatic distinctions.
export const TYPE_META: Record<
  DatabaseColumnType,
  { label: string; icon: typeof Baseline; color: string }
> = {
  text: { label: 'Text', icon: Baseline, color: 'text-muted-foreground' },
  number: { label: 'Number', icon: Hash, color: 'text-muted-foreground' },
  date: { label: 'Date', icon: Calendar, color: 'text-muted-foreground' },
  select: { label: 'Select', icon: ChevronDown, color: 'text-muted-foreground' },
  multiselect: { label: 'Multi-select', icon: MenuIcon, color: 'text-muted-foreground' },
  checkbox: { label: 'Checkbox', icon: Check, color: 'text-muted-foreground' },
};

/**
 * Palette for `select` option pills. Keys are persisted on the option's
 * `color` field so the swatch survives reload. Anything unknown falls back to
 * `slate` at render time — see `getSelectColor`. Dark-mode tags read as
 * solid-ish muted chips: fills at /30 with light (-200) text.
 */
export const SELECT_COLORS = [
  {
    key: 'slate',
    pill: 'bg-slate-500/30 text-slate-200 ring-slate-400/30',
    swatch: 'bg-slate-400',
  },
  { key: 'blue', pill: 'bg-blue-500/30 text-blue-200 ring-blue-400/30', swatch: 'bg-blue-400' },
  {
    key: 'emerald',
    pill: 'bg-emerald-500/30 text-emerald-200 ring-emerald-400/30',
    swatch: 'bg-emerald-400',
  },
  {
    key: 'amber',
    pill: 'bg-amber-500/30 text-amber-200 ring-amber-400/30',
    swatch: 'bg-amber-400',
  },
  { key: 'rose', pill: 'bg-rose-500/30 text-rose-200 ring-rose-400/30', swatch: 'bg-rose-400' },
  {
    key: 'violet',
    pill: 'bg-violet-500/30 text-violet-200 ring-violet-400/30',
    swatch: 'bg-violet-400',
  },
  { key: 'pink', pill: 'bg-pink-500/30 text-pink-200 ring-pink-400/30', swatch: 'bg-pink-400' },
  {
    key: 'orange',
    pill: 'bg-orange-500/30 text-orange-200 ring-orange-400/30',
    swatch: 'bg-orange-400',
  },
] as const;

export function getSelectColor(key: string | undefined) {
  return SELECT_COLORS.find((c) => c.key === key) ?? SELECT_COLORS[0];
}

/**
 * Best-effort color for an option that pre-dates the `color` field. We cycle
 * through the palette by index so a legacy 3-option column (Todo/Doing/Done)
 * reads as three distinct colors instead of three grey pills.
 */
export function resolveOptionColor(
  opt: { color?: string } | undefined,
  index: number
): (typeof SELECT_COLORS)[number] {
  if (opt?.color) return getSelectColor(opt.color);
  return SELECT_COLORS[index % SELECT_COLORS.length];
}

/** True when a cell has no meaningful value (used by Cards' hide-empty). */
export function isEmptyCellValue(value: DatabaseCellValue): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

// ─── Read-only value display (Cards / Kanban / chips) ──────────────────────

/**
 * Render a cell value as a compact, read-only node — a colored pill for
 * select/multiselect, tabular number, a check glyph for checkbox, plain text
 * otherwise. Used by the Cards and Kanban views (which never edit inline).
 */
export function CellValueDisplay({
  column,
  value,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
}) {
  if (isEmptyCellValue(value) && column.type !== 'checkbox') {
    return <span className="text-muted-foreground/60">—</span>;
  }
  switch (column.type) {
    case 'select': {
      const opts = column.options ?? [];
      const idx = opts.findIndex((o) => o.id === value);
      const opt = idx >= 0 ? opts[idx] : undefined;
      if (!opt) return <span className="text-muted-foreground/60">—</span>;
      const c = resolveOptionColor(opt, Math.max(0, idx));
      return <SelectPill label={opt.label} color={c} />;
    }
    case 'multiselect': {
      const opts = column.options ?? [];
      const ids = Array.isArray(value) ? value : [];
      const selected = opts.map((o, i) => ({ o, i })).filter(({ o }) => ids.includes(o.id));
      if (selected.length === 0) return <span className="text-muted-foreground/60">—</span>;
      return (
        <span className="flex flex-wrap items-center gap-1">
          {selected.map(({ o, i }) => (
            <SelectPill key={o.id} label={o.label} color={resolveOptionColor(o, i)} />
          ))}
        </span>
      );
    }
    case 'number':
      return <span className="tabular-nums">{Number(value).toLocaleString()}</span>;
    case 'checkbox':
      return value === true ? (
        <Check className="text-primary h-3.5 w-3.5" strokeWidth={3} />
      ) : (
        <span className="text-muted-foreground/60">—</span>
      );
    case 'date': {
      const s = typeof value === 'string' ? value : '';
      const parsed = s ? parseISO(s) : undefined;
      const d = parsed && isValid(parsed) ? parsed : undefined;
      return (
        <span className="text-muted-foreground tabular-nums">
          {d ? format(d, 'dd/MM/yyyy') : s}
        </span>
      );
    }
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

/** A flat pastel select pill (matches the in-cell tag styling). */
export function SelectPill({
  label,
  color,
}: {
  label: string;
  color: (typeof SELECT_COLORS)[number];
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[20px] items-center rounded-[5px] px-1.5 text-[12px] font-medium whitespace-nowrap',
        color.pill
      )}
    >
      {label}
    </span>
  );
}

// ─── Editable in-table cells ───────────────────────────────────────────────

/**
 * Text cell: a textarea (not an input) so long values wrap onto multiple lines
 * and the row grows to fit. Auto-sizes with the CSS "grid replica" technique —
 * an invisible sibling holds the same wrapped text and drives the shared grid
 * cell's height; the textarea stretches to fill it.
 */
function TextCell({
  value,
  onChange,
  disabled,
  isPrimary,
}: {
  value: string;
  onChange: (v: DatabaseCellValue) => void;
  disabled: boolean;
  isPrimary?: boolean;
}) {
  const trimmed = value.trim();
  const isUrlValue = /^https?:\/\/\S+$/.test(trimmed);

  const typography = cn(
    'px-2 py-2 text-[13.5px] leading-snug break-words whitespace-pre-wrap',
    isPrimary ? 'font-medium text-foreground' : 'text-muted-foreground'
  );

  if (isUrlValue) {
    return (
      <div className="min-w-0 px-2 py-2 text-[13.5px] leading-snug">
        <a
          href={trimmed}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={trimmed}
          className="text-primary hover:text-primary/80 underline underline-offset-2"
        >
          link
        </a>
      </div>
    );
  }

  return (
    <div className="grid min-w-0">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={1}
        dir="auto"
        className={cn(
          typography,
          'col-start-1 row-start-1 w-full resize-none overflow-hidden bg-transparent outline-none'
        )}
      />
      <div aria-hidden dir="auto" className={cn(typography, 'invisible col-start-1 row-start-1')}>
        {value + ' '}
      </div>
    </div>
  );
}

/**
 * Date cell — a formatted date when set, blank when empty. Uses shadcn Popover +
 * Calendar (theme-matched) rather than the native date input.
 */
function DateCell({
  value,
  onChange,
  disabled,
}: {
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  disabled: boolean;
}) {
  const dateStr = typeof value === 'string' ? value : '';
  const parsed = dateStr ? parseISO(dateStr) : undefined;
  const date = parsed && isValid(parsed) ? parsed : undefined;
  const display = date ? format(date, 'dd/MM/yyyy') : '';
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-full w-full items-center justify-start px-2 py-2 text-[13.5px] outline-none',
            disabled && 'cursor-not-allowed'
          )}
        >
          <span
            className={cn(date ? 'text-foreground/90 tabular-nums' : 'text-muted-foreground/50')}
          >
            {display}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <CalendarPicker
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : null);
            setOpen(false);
          }}
          captionLayout="dropdown"
          fromYear={2000}
          toYear={2100}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** Shared portal-positioning hook for the select popovers. */
function useAnchoredPosition(open: boolean, triggerRef: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.max(180, rect.width);
      const left = Math.min(rect.left, window.innerWidth - width - 8);
      setPos({ top: rect.bottom + 4, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, triggerRef]);
  return pos;
}

/** Custom single-select cell: a colored pill trigger + portalled picker. */
function SelectCell({
  column,
  value,
  onChange,
  disabled,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  disabled: boolean;
}) {
  const options = column.options ?? [];
  const selectedId = typeof value === 'string' ? value : '';
  const selectedIndex = options.findIndex((o) => o.id === selectedId);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition(open, triggerRef);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selColor = selected ? resolveOptionColor(selected, Math.max(0, selectedIndex)) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={`${column.name}: ${selected?.label ?? 'empty'}`}
        className="flex h-full w-full items-center justify-start px-2 py-2 text-left text-[13.5px]"
      >
        {selected && selColor ? (
          <SelectPill label={selected.label} color={selColor} />
        ) : (
          <span className="sr-only">empty</span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
            className="bg-popover text-popover-foreground z-[100] max-h-64 overflow-y-auto rounded-xl border p-1 shadow-xl"
          >
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="hover:bg-muted/60 text-muted-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
            >
              <X className="h-3 w-3" /> Clear
            </button>
            {options.map((opt, i) => {
              const c = resolveOptionColor(opt, i);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', c.swatch)} />
                  <span className={cn('rounded-md px-1.5 py-0.5 ring-1', c.pill)}>{opt.label}</span>
                </button>
              );
            })}
            {options.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                No options — add some in the column menu.
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

/** Multi-select cell: an array of ids rendered as pills + a toggling picker. */
function MultiSelectCell({
  column,
  value,
  onChange,
  disabled,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  disabled: boolean;
}) {
  const options = column.options ?? [];
  const selectedIds = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition(open, triggerRef);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (optId: string) => {
    onChange(
      selectedIds.includes(optId)
        ? selectedIds.filter((id) => id !== optId)
        : [...selectedIds, optId]
    );
  };

  const selectedOptions = options
    .map((o, i) => ({ opt: o, i }))
    .filter(({ opt }) => selectedIds.includes(opt.id));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={`${column.name}: ${
          selectedOptions.map(({ opt }) => opt.label).join(', ') || 'empty'
        }`}
        className="flex h-full w-full items-center justify-start px-2 py-2 text-left text-[13.5px]"
      >
        {selectedOptions.length > 0 ? (
          <span className="flex flex-wrap items-center justify-start gap-1">
            {selectedOptions.map(({ opt, i }) => (
              <SelectPill key={opt.id} label={opt.label} color={resolveOptionColor(opt, i)} />
            ))}
          </span>
        ) : (
          <span className="sr-only">empty</span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
            className="bg-popover text-popover-foreground z-[100] max-h-64 overflow-y-auto rounded-xl border p-1 shadow-xl"
          >
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="hover:bg-muted/60 text-muted-foreground flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            {options.map((opt, i) => {
              const c = resolveOptionColor(opt, i);
              const on = selectedIds.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  aria-pressed={on}
                  className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs"
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70'
                    )}
                    aria-hidden
                  >
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className={cn('rounded-md px-1.5 py-0.5 ring-1', c.pill)}>{opt.label}</span>
                </button>
              );
            })}
            {options.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                No options — add some in the column menu.
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

/** The dispatch for an editable in-table cell. */
export function CellEditor({
  column,
  value,
  onChange,
  editable,
  isPrimary,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  onChange: (v: DatabaseCellValue) => void;
  editable: boolean;
  isPrimary?: boolean;
}) {
  const disabled = !editable;
  switch (column.type) {
    case 'text':
      return (
        <TextCell
          value={(value as string) ?? ''}
          onChange={onChange}
          disabled={disabled}
          isPrimary={isPrimary}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={value == null ? '' : (value as number)}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            onChange(Number.isFinite(v as number) || v === null ? v : null);
          }}
          disabled={disabled}
          className="w-full bg-transparent px-2 py-2 text-right text-[13.5px] tabular-nums outline-none"
        />
      );
    case 'date':
      return <DateCell value={value} onChange={onChange} disabled={disabled} />;
    case 'checkbox': {
      const checked = Boolean(value);
      return (
        <div className="flex h-full items-center justify-start px-2 py-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={cn(
              'flex h-[17px] w-[17px] items-center justify-center rounded-[4px] border transition-colors',
              checked
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-input bg-background hover:border-primary/50'
            )}
          >
            {checked && <Check className="h-3 w-3" strokeWidth={3.5} />}
          </button>
        </div>
      );
    }
    case 'select':
      return <SelectCell column={column} value={value} onChange={onChange} disabled={disabled} />;
    case 'multiselect':
      return (
        <MultiSelectCell column={column} value={value} onChange={onChange} disabled={disabled} />
      );
  }
}

// ─── Type coercion (runs when a column's type changes) ─────────────────────

export function coerceValue(raw: DatabaseCellValue, type: DatabaseColumnType): DatabaseCellValue {
  if (raw == null) return type === 'checkbox' ? false : type === 'multiselect' ? [] : null;
  switch (type) {
    case 'text':
      return Array.isArray(raw) ? raw.join(', ') : String(raw);
    case 'number': {
      const n = Number(Array.isArray(raw) ? raw[0] : raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'date':
      return typeof raw === 'string' ? raw : null;
    case 'checkbox':
      return Array.isArray(raw) ? raw.length > 0 : Boolean(raw);
    case 'select':
      if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : null;
      return typeof raw === 'string' ? raw : null;
    case 'multiselect':
      if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
      return typeof raw === 'string' ? [raw] : [];
  }
}
