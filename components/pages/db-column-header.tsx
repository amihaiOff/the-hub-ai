'use client';

import { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  makeSelectOption,
  type DatabaseColumn,
  type DatabaseColumnType,
  type SelectOption,
} from './database-extension';
import { SELECT_COLORS, TYPE_META, resolveOptionColor } from './db-cells';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { GESTURE } from '@/lib/pages/db-gestures';

/**
 * Table column header: type icon + name. Tapping/clicking the name (or
 * right-clicking) opens the full column sheet — rename, type change, select
 * options, delete — so there's no intermediate action row. A freshly-added
 * column can still auto-focus an inline rename (autoStartEdit). The column
 * resize handle is owned by the table view; sorting lives in the toolbar.
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
          onClick={editable ? () => setMobileSheet(true) : undefined}
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

/**
 * The rename field. Mounted only while an option is being edited, so it always
 * opens showing the option's current name — no syncing needed.
 */
function OptionNameInput({
  label,
  onCommit,
  onCancel,
}: {
  label: string;
  onCommit: (label: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(label);

  return (
    <input
      value={draft}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      // A blank name would render an unreadable pill, so an emptied field
      // commits as "leave it alone" rather than as a rename.
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(draft.trim());
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      aria-label={`Rename ${label}`}
      className="border-border/60 bg-background flex-1 rounded-md border px-2 py-1 text-sm outline-none"
    />
  );
}

/**
 * One row of the select-option editor: colour swatch, the option's name, and
 * remove.
 *
 * The name is editable in place — double-click with a pointer, long-press on
 * touch (this app is used on a phone as much as a laptop), or Enter/F2 when
 * focused. Renaming changes only the label: cells store the option's id, so
 * every row already tagged with it follows the new name rather than losing its
 * value, which is what makes this safe to offer as a casual inline edit.
 */
function OptionRow({
  option,
  color,
  editing,
  onStartEdit,
  onEndEdit,
  onRename,
  isNameTaken,
  onRemove,
  colorOpen,
  onToggleColor,
  onPickColor,
}: {
  option: SelectOption;
  color: { pill: string; swatch: string };
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onRename: (label: string) => void;
  /** Whether another choice in this column already reads the same. */
  isNameTaken: (label: string) => boolean;
  onRemove: () => void;
  colorOpen: boolean;
  onToggleColor: () => void;
  onPickColor: (key: string) => void;
}) {
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const { bindRef } = useLongPress(onStartEdit, {
    delay: GESTURE.longPressMs,
    moveTolerance: GESTURE.longPressMoveTolerance,
  });

  // When the field closes, put focus back on the name it was editing —
  // otherwise focus falls to the document and the next Tab restarts at the top
  // of the page rather than continuing through the options.
  const endEdit = () => {
    onEndEdit();
    requestAnimationFrame(() => pillRef.current?.focus());
  };

  return (
    <div className="relative">
      <div className="border-border/60 flex items-center gap-2 rounded-lg border px-2 py-2">
        <button
          type="button"
          onClick={onToggleColor}
          aria-label={`Color for ${option.label}`}
          className={cn('h-5 w-5 shrink-0 rounded-full', color.swatch)}
        />
        {editing ? (
          <OptionNameInput
            label={option.label}
            onCommit={(label) => {
              // Two choices reading the same can't be told apart: picking one
              // by name is ambiguous, so the structured write API refuses them
              // outright and neither could be set by an agent again. Treated
              // like a blank name — the edit is dropped, nothing is renamed.
              if (label && label !== option.label && !isNameTaken(label)) onRename(label);
              endEdit();
            }}
            onCancel={endEdit}
          />
        ) : (
          <span
            ref={(el) => {
              bindRef(el);
              pillRef.current = el;
            }}
            role="button"
            tabIndex={0}
            onDoubleClick={onStartEdit}
            onKeyDown={(e) => {
              // Space as well as Enter: a screen reader announces this as a
              // button, and Space is the first thing tried on one. Without it
              // the key just scrolls the sheet.
              if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') {
                e.preventDefault();
                onStartEdit();
              }
            }}
            // Accessible name stays exactly the visible text: voice-control
            // users say "click Todo", and a name that drifts from the label
            // breaks that. The affordance is carried by the shortcut hint and
            // the tooltip instead.
            aria-keyshortcuts="F2"
            title="Double-click or long-press to rename"
            className={cn(
              // `touch-manipulation` stops iOS reserving the gesture for
              // double-tap-zoom, which is the very gesture that opens the edit.
              'flex-1 cursor-pointer touch-manipulation truncate rounded-md px-2 py-1 text-sm ring-1 select-none',
              color.pill
            )}
          >
            {option.label}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${option.label}`}
          className="text-muted-foreground/70 hover:text-destructive flex h-8 w-8 items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {colorOpen && (
        <div className="bg-popover mt-1 flex flex-wrap gap-1.5 rounded-lg border p-2 shadow-lg">
          {SELECT_COLORS.map((sc) => (
            <button
              key={sc.key}
              type="button"
              onClick={() => onPickColor(sc.key)}
              aria-label={sc.key}
              className={cn(
                'h-7 w-7 rounded-full ring-1 ring-white/10',
                sc.swatch,
                option.color === sc.key && 'ring-2 ring-white/70'
              )}
            />
          ))}
        </div>
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
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== column.name) onRename(trimmed);
    else setNameDraft(column.name);
  };

  return (
    <Sheet open modal={false} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        // While an option name is being edited, Escape means "cancel this
        // rename", not "throw the whole column sheet away". It has to be
        // caught here: Radix listens for Escape on the DOCUMENT in the
        // CAPTURE phase, so it fires before the input's own handler and no
        // amount of stopPropagation() down there can hold the sheet open.
        // The input's Escape handler still runs afterwards and exits editing.
        onEscapeKeyDown={(e) => {
          if (editingOptionId) e.preventDefault();
        }}
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
                {(column.options ?? []).map((opt, i) => (
                  <OptionRow
                    key={opt.id}
                    option={opt}
                    color={resolveOptionColor(opt, i)}
                    editing={editingOptionId === opt.id}
                    onStartEdit={() => {
                      setEditingOptionId(opt.id);
                      setColorPickerFor(null);
                    }}
                    onEndEdit={() => setEditingOptionId(null)}
                    onRename={(label) =>
                      onSetOptions(
                        (column.options ?? []).map((o) => (o.id === opt.id ? { ...o, label } : o))
                      )
                    }
                    isNameTaken={(label) =>
                      (column.options ?? []).some(
                        (o) =>
                          o.id !== opt.id && o.label.trim().toLowerCase() === label.toLowerCase()
                      )
                    }
                    onRemove={() =>
                      onSetOptions((column.options ?? []).filter((o) => o.id !== opt.id))
                    }
                    colorOpen={colorPickerFor === opt.id}
                    onToggleColor={() =>
                      setColorPickerFor((cur) => (cur === opt.id ? null : opt.id))
                    }
                    onPickColor={(key) => {
                      onSetOptions(
                        (column.options ?? []).map((o) =>
                          o.id === opt.id ? { ...o, color: key } : o
                        )
                      );
                      setColorPickerFor(null);
                    }}
                  />
                ))}
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
