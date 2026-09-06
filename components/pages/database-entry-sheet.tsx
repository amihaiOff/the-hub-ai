'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Calendar, CheckSquare, ChevronDown, Hash, List, Tags, Trash2, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBackToClose } from '@/lib/hooks/use-back-to-close';
import { PageBodyEditor } from './page-body-editor-lazy';
import { coerceValue, getSelectColor, resolveOptionColor } from './db-cells';
import type {
  DatabaseCellValue,
  DatabaseColumn,
  DatabaseColumnType,
  DatabaseRow,
} from './database-extension';
import { primaryColumn } from '@/lib/pages/db-rows';

/** Commit body edits to the node attrs this long after the last keystroke. */
const BODY_COMMIT_MS = 400;

const TYPE_ICON: Record<DatabaseColumnType, LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  checkbox: CheckSquare,
  select: List,
  multiselect: Tags,
};

interface DatabaseEntrySheetProps {
  /** The open row, or null when the panel is closed. */
  row: DatabaseRow | null;
  columns: DatabaseColumn[];
  editable: boolean;
  onUpdateCell: (rowId: string, colId: string, value: DatabaseCellValue) => void;
  onUpdateBody: (rowId: string, body: unknown) => void;
  onDeleteRow: (rowId: string) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Detail view for a single database-block row — like the Tasks detail sheet.
 * Right-hand side panel on desktop, full-screen on mobile (`w-full sm:max-w-lg`),
 * with the row's fields on top and a rich-text body below. Browser Back closes
 * it (via `useBackToClose`). Writes flow back to the host Tiptap node through the
 * callbacks, which is why we swallow Radix's outside-interaction close events —
 * a write refocuses the editor and would otherwise auto-close the sheet (same
 * fix as ColumnMobileSheet).
 */
export function DatabaseEntrySheet({
  row,
  columns,
  editable,
  onUpdateCell,
  onUpdateBody,
  onDeleteRow,
  onOpenChange,
}: DatabaseEntrySheetProps) {
  const open = !!row;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // No SheetDescription — the fields/body are self-describing. Tell Radix
        // it's intentional so it doesn't warn about a missing description.
        aria-describedby={undefined}
        // Outside-click-to-close is deliberately disabled: a field/body write
        // calls updateAttributes, which refocuses the host editor, and Radix
        // would read that as an outside interaction and auto-close the sheet
        // (same fix as ColumnMobileSheet). Close via the X button, Escape, or
        // browser Back (useBackToClose).
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="w-full overflow-y-auto rounded-l-3xl p-6 pt-12 sm:max-w-lg"
      >
        {row && (
          // Keyed by row id so all local state (body draft) resets when a
          // different row opens in the same sheet.
          <EntryBody
            key={row.id}
            row={row}
            columns={columns}
            editable={editable}
            onUpdateCell={onUpdateCell}
            onUpdateBody={onUpdateBody}
            onDeleteRow={onDeleteRow}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EntryBody({
  row,
  columns,
  editable,
  onUpdateCell,
  onUpdateBody,
  onDeleteRow,
  onClose,
}: {
  row: DatabaseRow;
  columns: DatabaseColumn[];
  editable: boolean;
  onUpdateCell: (rowId: string, colId: string, value: DatabaseCellValue) => void;
  onUpdateBody: (rowId: string, body: unknown) => void;
  onDeleteRow: (rowId: string) => void;
  onClose: () => void;
}) {
  // Browser Back mirrors closing the sheet (mobile "swipe/back to exit").
  useBackToClose(true, onClose);

  const primary = primaryColumn(columns);
  const otherColumns = primary ? columns.filter((c) => c.id !== primary.id) : columns;

  // Body is held locally and committed to the node attrs on a debounce + on
  // unmount, so a typing burst collapses into ~1 transaction/undo step.
  const latestBody = useRef<unknown>(row.body ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    onUpdateBody(row.id, latestBody.current);
  }, [onUpdateBody, row.id]);

  useEffect(() => {
    // Flush any pending body edit when the panel unmounts (rapid close/back).
    return () => {
      if (timer.current) commit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBodyChange = (doc: unknown) => {
    if (!editable) return;
    latestBody.current = doc;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, BODY_COMMIT_MS);
  };

  // Only a text primary column has a meaningful scalar title; a non-text
  // primary (select/multiselect/etc.) renders through FieldControl below, so
  // guard the cast so an array value never becomes the sr-only dialog name.
  const rawPrimary = primary ? row.cells[primary.id] : null;
  const primaryValue = typeof rawPrimary === 'string' ? rawPrimary : '';

  return (
    <div className="space-y-6">
      {/* Accessible dialog name for screen readers (Radix requires a Title).
          The visible title below is an editable textarea, not a heading. */}
      <SheetTitle className="sr-only">{primaryValue || 'Entry'}</SheetTitle>
      {/* Title = the primary column (usually the "Name"). Non-text primary
          columns fall back to the shared field control below the title. */}
      {primary && primary.type === 'text' ? (
        <textarea
          value={primaryValue}
          onChange={(e) => onUpdateCell(row.id, primary.id, e.target.value)}
          disabled={!editable}
          rows={1}
          dir="auto"
          placeholder="Untitled"
          aria-label={primary.name}
          className="text-foreground placeholder:text-muted-foreground/50 w-full resize-none bg-transparent text-2xl leading-tight font-semibold outline-none"
        />
      ) : null}

      {/* Fields */}
      <div className="space-y-3">
        {(primary && primary.type !== 'text' ? [primary, ...otherColumns] : otherColumns).map(
          (col) => (
            <FieldRow
              key={col.id}
              column={col}
              value={row.cells[col.id] ?? null}
              editable={editable}
              onChange={(v) => onUpdateCell(row.id, col.id, v)}
            />
          )
        )}
      </div>

      {/* Body — a distinguished editing surface (tinted card) like the Tasks
          notes area, so it reads as an input rather than flush page text. */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.15em] uppercase">
          Notes
        </h3>
        <div className="db-entry-body bg-muted/40 rounded-2xl px-3 py-2">
          <PageBodyEditor
            initialContent={row.body ?? null}
            onChange={onBodyChange}
            editable={editable}
            allowDatabaseBlock={false}
          />
        </div>
      </div>

      {/* Delete */}
      {editable && (
        <div className="border-border/40 border-t pt-4">
          <button
            type="button"
            onClick={() => {
              onDeleteRow(row.id);
              onClose();
            }}
            className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors"
          >
            <Trash2 className="h-4 w-4" /> Delete entry
          </button>
        </div>
      )}
    </div>
  );
}

/** A single field row: label + type icon on the left, editor on the right. */
function FieldRow({
  column,
  value,
  editable,
  onChange,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  editable: boolean;
  onChange: (v: DatabaseCellValue) => void;
}) {
  const Icon = TYPE_ICON[column.type];
  return (
    <div className="flex items-start gap-4">
      <div className="text-muted-foreground flex w-28 shrink-0 items-center gap-2 pt-1.5 text-sm">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{column.name}</span>
      </div>
      <div className="min-w-0 flex-1">
        <FieldControl column={column} value={value} editable={editable} onChange={onChange} />
      </div>
    </div>
  );
}

// Fields read as distinct inputs against the sheet (tinted fill like the Tasks
// detail's controls), not flush text.
const FIELD_INPUT =
  'border-border/60 bg-muted/40 focus:border-ring w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none disabled:opacity-60';

// Shared width for the compact dropdown-style controls (select, date, number)
// so they line up at the same span and don't stretch across the whole card.
const FIELD_CONTROL_W = 'w-44 max-w-full';

// Pill trigger that visually matches the Radix SelectTrigger (see components/ui
// /select.tsx) — used by the date field so the two dropdowns read identically.
const FIELD_TRIGGER =
  'border-border/60 bg-muted/40 flex h-9 items-center justify-between gap-2 rounded-lg border px-3 text-sm outline-none';

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY` for display (raw ISO stays on the wire). */
function formatDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function FieldControl({
  column,
  value,
  editable,
  onChange,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  editable: boolean;
  onChange: (v: DatabaseCellValue) => void;
}) {
  const disabled = !editable;

  switch (column.type) {
    case 'text':
      return (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={1}
          dir="auto"
          className={cn(FIELD_INPUT, 'resize-y')}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={value == null ? '' : (value as number)}
          onChange={(e) =>
            onChange(e.target.value === '' ? null : coerceValue(e.target.value, 'number'))
          }
          disabled={disabled}
          className={cn(FIELD_INPUT, 'tabular-nums', '!w-44 max-w-full')}
        />
      );
    case 'date':
      return <DateField column={column} value={value} disabled={disabled} onChange={onChange} />;
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4"
        />
      );
    case 'select':
      return <SelectField column={column} value={value} disabled={disabled} onChange={onChange} />;
    case 'multiselect':
      return (
        <MultiSelectField column={column} value={value} disabled={disabled} onChange={onChange} />
      );
  }
}

/**
 * Date field rendered to match the Select dropdown: a tinted pill with a chevron
 * on the right. A transparent native date input overlays it so tapping opens the
 * platform date picker while the visible chrome stays consistent with Status.
 */
function DateField({
  column,
  value,
  disabled,
  onChange,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  disabled: boolean;
  onChange: (v: DatabaseCellValue) => void;
}) {
  const dateStr = typeof value === 'string' ? value : '';
  return (
    <label
      className={cn(
        FIELD_TRIGGER,
        FIELD_CONTROL_W,
        'relative cursor-pointer',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <span className={cn('truncate tabular-nums', !dateStr && 'text-muted-foreground')}>
        {dateStr ? formatDmy(dateStr) : '—'}
      </span>
      <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
      <input
        type="date"
        value={dateStr}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        disabled={disabled}
        aria-label={column.name}
        // Transparent overlay covering the pill — opens the native picker on tap
        // without showing the browser's own (differently-styled) date control.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </label>
  );
}

/** Sentinel for the "no selection" item (Radix Select can't use "" as a value). */
const SELECT_NONE = '__none__';

/** Single-select rendered as a dropdown, with a color dot per option. */
function SelectField({
  column,
  value,
  disabled,
  onChange,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  disabled: boolean;
  onChange: (v: DatabaseCellValue) => void;
}) {
  const options = column.options ?? [];
  const selectedId = typeof value === 'string' ? value : '';
  if (options.length === 0) {
    return <span className="text-muted-foreground/60 text-sm">No options</span>;
  }
  return (
    <Select
      value={selectedId || SELECT_NONE}
      onValueChange={(v) => onChange(v === SELECT_NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={cn('bg-muted/40 border-border/60 rounded-lg', FIELD_CONTROL_W)}>
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent className="rounded-2xl">
        <SelectItem value={SELECT_NONE}>
          <span className="text-muted-foreground">—</span>
        </SelectItem>
        {options.map((opt, i) => {
          const c = opt.color ? getSelectColor(opt.color) : resolveOptionColor(opt, i);
          return (
            <SelectItem key={opt.id} value={opt.id}>
              <span className="flex items-center gap-2">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', c.swatch)} />
                {opt.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * Multi-select field: the options rendered as toggle pills (wrapping), each
 * colored and showing a check when selected. Inline (no dropdown) so several
 * options are visible and tappable at once on mobile — mirrors the filter
 * panel's multi-toggle. Value is an array of option ids.
 */
function MultiSelectField({
  column,
  value,
  disabled,
  onChange,
}: {
  column: DatabaseColumn;
  value: DatabaseCellValue;
  disabled: boolean;
  onChange: (v: DatabaseCellValue) => void;
}) {
  const options = column.options ?? [];
  const selectedIds = Array.isArray(value) ? value : [];
  if (options.length === 0) {
    return <span className="text-muted-foreground/60 text-sm">No options</span>;
  }
  const toggle = (optId: string) => {
    if (disabled) return;
    onChange(
      selectedIds.includes(optId)
        ? selectedIds.filter((id) => id !== optId)
        : [...selectedIds, optId]
    );
  };
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {options.map((opt, i) => {
        const c = opt.color ? getSelectColor(opt.color) : resolveOptionColor(opt, i);
        const on = selectedIds.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            disabled={disabled}
            aria-pressed={on}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-opacity disabled:opacity-60',
              on ? c.pill : 'text-muted-foreground ring-border/60 hover:bg-muted/50'
            )}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-full', on ? c.swatch : 'bg-muted-foreground/40')}
              aria-hidden
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
