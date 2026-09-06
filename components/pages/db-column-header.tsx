'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  makeSelectOption,
  type DatabaseColumn,
  type DatabaseColumnType,
} from './database-extension';
import { SELECT_COLORS, TYPE_META, resolveOptionColor } from './db-cells';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { GESTURE } from '@/lib/pages/db-gestures';

/**
 * Table column header: type icon + name. A single click (or long-press on
 * touch) opens the full column sheet — rename, type change, select options,
 * delete — so there's no intermediate action row. A freshly-added column can
 * still auto-focus an inline rename (autoStartEdit). The column resize handle
 * is owned by the table view; sorting lives in the toolbar.
 */
export function ColumnHeader({
  column,
  editable,
  autoStartEdit,
  onRename,
  onChangeType,
  onDelete,
  onSetOptions,
}: {
  column: DatabaseColumn;
  editable: boolean;
  autoStartEdit?: boolean;
  onRename: (name: string) => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onDelete: () => void;
  onSetOptions: (opts: { id: string; label: string; color?: string }[]) => void;
}) {
  const [editing, setEditing] = useState(() => Boolean(autoStartEdit && editable));
  const [mobileSheet, setMobileSheet] = useState(false);
  const [name, setName] = useState(column.name);

  // Touch: hold-to-open the column sheet via the shared long-press hook (native
  // passive listeners → no first-touch scroll stall). Desktop keeps click and
  // right-click (contextmenu) to open. `consumedClick` swallows the click that
  // follows a long-press so it doesn't reopen the sheet.
  const { bindRef, consumedClick } = useLongPress(() => setMobileSheet(true), {
    delay: GESTURE.longPressMs,
    moveTolerance: GESTURE.longPressMoveTolerance,
  });

  if (!editing && name !== column.name) {
    setName(column.name);
  }
  const typeMeta = TYPE_META[column.type];
  const TypeIcon = typeMeta.icon;

  return (
    <div className="group/header relative flex w-full items-center gap-1.5 px-3 py-1.5">
      <TypeIcon className={cn('h-3.5 w-3.5 shrink-0', typeMeta.color)} aria-hidden />
      {editable && editing ? (
        <input
          data-col-id={column.id}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== column.name) onRename(name.trim());
            else if (!name.trim()) setName(column.name);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(column.name);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          size={1}
          className="text-muted-foreground min-w-0 flex-1 bg-transparent text-[12.5px] font-medium outline-none"
        />
      ) : (
        <button
          type="button"
          ref={editable ? bindRef : undefined}
          onClick={
            editable
              ? () => {
                  if (!consumedClick()) setMobileSheet(true);
                }
              : undefined
          }
          onContextMenu={
            editable
              ? (e) => {
                  e.preventDefault();
                  setMobileSheet(true);
                }
              : undefined
          }
          title={editable ? 'Column settings' : undefined}
          className="text-muted-foreground min-w-0 flex-1 truncate text-left text-[12.5px] font-medium select-none"
        >
          {column.name}
        </button>
      )}

      {mobileSheet && (
        <ColumnMobileSheet
          column={column}
          onClose={() => setMobileSheet(false)}
          onRename={onRename}
          onChangeType={onChangeType}
          onDelete={onDelete}
          onSetOptions={onSetOptions}
        />
      )}
    </div>
  );
}

/** Bottom-sheet column controls for touch devices (long-press / right-click). */
function ColumnMobileSheet({
  column,
  onClose,
  onRename,
  onChangeType,
  onDelete,
  onSetOptions,
}: {
  column: DatabaseColumn;
  onClose: () => void;
  onRename: (name: string) => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onDelete: () => void;
  onSetOptions: (opts: { id: string; label: string; color?: string }[]) => void;
}) {
  const [nameDraft, setNameDraft] = useState(column.name);
  const [newOption, setNewOption] = useState('');
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== column.name) onRename(trimmed);
    else setNameDraft(column.name);
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0 sm:bottom-4 sm:mx-auto sm:h-auto sm:max-w-md sm:rounded-2xl sm:border"
      >
        <SheetHeader className="border-border/40 border-b p-4">
          <SheetTitle className="text-left text-base">{column.name}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <label className="text-muted-foreground mb-2 block text-[10px] font-semibold tracking-wider uppercase">
            Name
          </label>
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            }}
            className="border-border/60 bg-background focus:border-primary/60 w-full rounded-lg border px-3 py-2.5 text-base outline-none"
          />

          <p className="text-muted-foreground mt-5 mb-2 text-[10px] font-semibold tracking-wider uppercase">
            Type
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_META) as DatabaseColumnType[]).map((t) => {
              const Icon = TYPE_META[t].icon;
              const active = column.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChangeType(t)}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                    active
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/60 hover:bg-muted/50'
                  )}
                >
                  <Icon className={cn('h-4 w-4', TYPE_META[t].color)} />
                  {TYPE_META[t].label}
                </button>
              );
            })}
          </div>

          {(column.type === 'select' || column.type === 'multiselect') && (
            <>
              <p className="text-muted-foreground mt-5 mb-2 text-[10px] font-semibold tracking-wider uppercase">
                Options
              </p>
              <div className="space-y-2">
                {(column.options ?? []).map((opt, i) => {
                  const c = resolveOptionColor(opt, i);
                  return (
                    <div key={opt.id} className="relative">
                      <div className="border-border/60 flex items-center gap-2 rounded-lg border px-2 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setColorPickerFor((cur) => (cur === opt.id ? null : opt.id))
                          }
                          aria-label={`Color for ${opt.label}`}
                          className={cn('h-5 w-5 shrink-0 rounded-full', c.swatch)}
                        />
                        <span
                          className={cn(
                            'flex-1 truncate rounded-md px-2 py-1 text-sm ring-1',
                            c.pill
                          )}
                        >
                          {opt.label}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onSetOptions((column.options ?? []).filter((o) => o.id !== opt.id))
                          }
                          aria-label={`Remove ${opt.label}`}
                          className="text-muted-foreground/70 hover:text-destructive flex h-8 w-8 items-center justify-center"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {colorPickerFor === opt.id && (
                        <div className="bg-popover mt-1 flex flex-wrap gap-1.5 rounded-lg border p-2 shadow-lg">
                          {SELECT_COLORS.map((sc) => (
                            <button
                              key={sc.key}
                              type="button"
                              onClick={() => {
                                onSetOptions(
                                  (column.options ?? []).map((o) =>
                                    o.id === opt.id ? { ...o, color: sc.key } : o
                                  )
                                );
                                setColorPickerFor(null);
                              }}
                              aria-label={sc.key}
                              className={cn(
                                'h-7 w-7 rounded-full ring-1 ring-white/10',
                                sc.swatch,
                                opt.color === sc.key && 'ring-2 ring-white/70'
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const label = newOption.trim();
                    if (!label) return;
                    const next =
                      SELECT_COLORS[(column.options?.length ?? 0) % SELECT_COLORS.length];
                    onSetOptions([...(column.options ?? []), makeSelectOption(label, next.key)]);
                    setNewOption('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option"
                    className="border-border/60 bg-background flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
                  >
                    Add
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        <div className="border-border/40 border-t p-4">
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="hover:bg-destructive/10 text-destructive border-destructive/40 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
          >
            <Trash2 className="h-4 w-4" /> Delete column
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
