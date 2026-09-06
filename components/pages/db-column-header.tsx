'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  makeSelectOption,
  type DatabaseColumn,
  type DatabaseColumnType,
} from './database-extension';
import { SELECT_COLORS, TYPE_META, resolveOptionColor } from './db-cells';

/**
 * Table column header: type icon + name, a click-to-expand action row (column
 * options + delete), double-click / long-press to rename, and a portalled
 * options popover (type change + select options). The column resize handle is
 * owned by the table view (it needs the `<th>` geometry), not this component.
 * Sorting moved to the toolbar in v2, so the header no longer carries a sort
 * toggle.
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
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const menuOpen = menuAnchor !== null;
  const [editing, setEditing] = useState(() => Boolean(autoStartEdit && editable));
  const [mobileSheet, setMobileSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState(column.name);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      setExpanded(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [expanded]);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const startPress = () => {
    clearPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setMobileSheet(true);
    }, 500);
  };

  if (!editing && name !== column.name) {
    setName(column.name);
  }
  const typeMeta = TYPE_META[column.type];
  const TypeIcon = typeMeta.icon;

  return (
    <div
      ref={rootRef}
      className="group/header relative flex w-full items-center gap-1.5 px-3 py-1.5"
    >
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
          onClick={editable ? () => setExpanded((v) => !v) : undefined}
          onDoubleClick={
            editable
              ? (e) => {
                  e.stopPropagation();
                  setEditing(true);
                }
              : undefined
          }
          onTouchStart={editable ? startPress : undefined}
          onTouchMove={clearPress}
          onTouchEnd={clearPress}
          onTouchCancel={clearPress}
          onContextMenu={
            editable
              ? (e) => {
                  e.preventDefault();
                  setMobileSheet(true);
                }
              : undefined
          }
          title={editable ? 'Click for column actions · double-click to rename' : undefined}
          className={cn(
            'text-muted-foreground min-w-0 flex-1 truncate text-left text-[12.5px] font-medium select-none',
            expanded && 'text-foreground'
          )}
        >
          {column.name}
        </button>
      )}

      {editable && expanded && !editing && (
        <div className="pointer-events-auto absolute top-full left-3 z-20 -mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor((cur) => (cur ? null : (e.currentTarget as HTMLButtonElement)));
            }}
            aria-label="Column options"
            title="Column options"
            className="text-muted-foreground flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-emerald-400/10 hover:text-emerald-400"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete column"
            title="Delete column"
            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive flex h-6 w-6 items-center justify-center rounded-md transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {menuOpen && (
        <ColumnMenu
          anchor={menuAnchor}
          column={column}
          onClose={() => setMenuAnchor(null)}
          onChangeType={onChangeType}
          onSetOptions={onSetOptions}
        />
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

/** Portalled column-options popover: type change + select options editing. */
function ColumnMenu({
  anchor,
  column,
  onClose,
  onChangeType,
  onSetOptions,
}: {
  anchor: HTMLElement | null;
  column: DatabaseColumn;
  onClose: () => void;
  onChangeType: (type: DatabaseColumnType) => void;
  onSetOptions: (opts: { id: string; label: string; color?: string }[]) => void;
}) {
  const [newOption, setNewOption] = useState('');
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const width = 240;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      setPos({ top: rect.bottom + 4, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t)) return;
      if (anchor && anchor.contains(t)) return;
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
  }, [anchor, onClose]);

  if (!pos) return null;

  const content = (
    <div
      ref={menuRef}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240 }}
      className="bg-popover text-popover-foreground z-[100] rounded-xl border p-1 shadow-xl"
    >
      <p className="text-muted-foreground px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
        Column type
      </p>
      {(Object.keys(TYPE_META) as DatabaseColumnType[]).map((t) => {
        const Icon = TYPE_META[t].icon;
        return (
          <button
            key={t}
            type="button"
            onClick={() => {
              onChangeType(t);
              if (t !== 'select' && t !== 'multiselect') onClose();
            }}
            className={cn(
              'hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs',
              column.type === t && 'bg-muted/50 font-medium'
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', TYPE_META[t].color)} /> {TYPE_META[t].label}
          </button>
        );
      })}

      {(column.type === 'select' || column.type === 'multiselect') && (
        <div className="border-border/50 mt-1 border-t pt-1">
          <p className="text-muted-foreground px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wider uppercase">
            Options
          </p>
          <div className="space-y-1 px-1 pb-1">
            {(column.options ?? []).map((opt, i) => {
              const c = resolveOptionColor(opt, i);
              return (
                <div key={opt.id} className="relative flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setColorPickerFor((cur) => (cur === opt.id ? null : opt.id))}
                    aria-label={`Color for ${opt.label}`}
                    className={cn('h-3.5 w-3.5 shrink-0 rounded-full', c.swatch)}
                  />
                  <span className={cn('flex-1 truncate rounded-md px-2 py-1 text-xs ring-1', c.pill)}>
                    {opt.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSetOptions((column.options ?? []).filter((o) => o.id !== opt.id))}
                    aria-label={`Remove ${opt.label}`}
                    className="text-muted-foreground/60 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {colorPickerFor === opt.id && (
                    <div className="bg-popover absolute top-full left-0 z-[110] mt-1 flex flex-wrap gap-1 rounded-lg border p-1.5 shadow-lg">
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
                            'h-4 w-4 rounded-full ring-1 ring-white/10 hover:ring-2 hover:ring-white/40',
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
                const next = SELECT_COLORS[(column.options?.length ?? 0) % SELECT_COLORS.length];
                onSetOptions([...(column.options ?? []), makeSelectOption(label, next.key)]);
                setNewOption('');
              }}
              className="flex gap-1"
            >
              <input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Add option"
                className="border-border/60 bg-background flex-1 rounded-md border px-2 py-1 text-xs outline-none"
              />
              <button
                type="submit"
                className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
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
                          onClick={() => setColorPickerFor((cur) => (cur === opt.id ? null : opt.id))}
                          aria-label={`Color for ${opt.label}`}
                          className={cn('h-5 w-5 shrink-0 rounded-full', c.swatch)}
                        />
                        <span className={cn('flex-1 truncate rounded-md px-2 py-1 text-sm ring-1', c.pill)}>
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
                    const next = SELECT_COLORS[(column.options?.length ?? 0) % SELECT_COLORS.length];
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
