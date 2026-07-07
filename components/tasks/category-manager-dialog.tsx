'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useTaskCategories,
  useCreateTaskCategory,
  useUpdateTaskCategory,
  useDeleteTaskCategory,
  type TaskCategoryRow,
} from '@/lib/hooks/use-tasks';

interface CategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manage task categories: rename, delete (with a confirm step), and add.
 *
 * Back behaviour: the modal and its "editing/adding/confirming" sub-state each
 * own a history entry, so a single Back exits the sub-state first and only
 * closes the modal when there's no sub-state. A single popstate handler
 * coordinates the two levels (two independent handlers would both fire on one
 * Back and over-close).
 */
export function CategoryManagerDialog({ open, onOpenChange }: CategoryManagerDialogProps) {
  const { data: categories = [] } = useTaskCategories();
  const create = useCreateTaskCategory();
  const update = useUpdateTaskCategory();
  const del = useDeleteTaskCategory();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const subActive = editingId !== null || adding || confirmDeleteId !== null;

  const clearSub = () => {
    setEditingId(null);
    setDraft('');
    setAdding(false);
    setNewName('');
    setConfirmDeleteId(null);
  };
  const clearSubRef = useRef(clearSub);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    clearSubRef.current = clearSub;
    onOpenChangeRef.current = onOpenChange;
  });

  // ─── Two-level Back handling ──────────────────────────────────────────
  const modalPushed = useRef(false);
  const subPushed = useRef(false);

  useEffect(() => {
    if (open && !modalPushed.current) {
      modalPushed.current = true;
      window.history.pushState({ level: 'catModal' }, '');
    } else if (!open && modalPushed.current) {
      modalPushed.current = false;
      if (window.history.state?.level === 'catModal') window.history.back();
    }
  }, [open]);

  useEffect(() => {
    if (subActive && !subPushed.current) {
      subPushed.current = true;
      window.history.pushState({ level: 'catSub' }, '');
    } else if (!subActive && subPushed.current) {
      subPushed.current = false;
      if (window.history.state?.level === 'catSub') window.history.back();
    }
  }, [subActive]);

  useEffect(() => {
    const onPopState = () => {
      // Deepest level first: exit the sub-state, otherwise close the modal.
      if (subPushed.current) {
        subPushed.current = false;
        clearSubRef.current();
      } else if (modalPushed.current) {
        modalPushed.current = false;
        onOpenChangeRef.current(false);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // If we unmount while still open (e.g. navigating away), unwind our dummy
  // entries — but only while they're still the current ones, so we never undo
  // a real navigation the user just made.
  useEffect(
    () => () => {
      const level = window.history.state?.level;
      const steps = (subPushed.current ? 1 : 0) + (modalPushed.current ? 1 : 0);
      if (steps > 0 && (level === 'catSub' || level === 'catModal')) {
        subPushed.current = false;
        modalPushed.current = false;
        window.history.go(-steps);
      }
    },
    []
  );

  // The Dialog's own affordances (X / overlay / Esc) dismiss the whole modal;
  // the hardware Back button, by contrast, is handled by popstate one level at
  // a time. Unwind whatever entries we pushed in a single go() so a stray
  // history entry is never left behind.
  const handleDialogOpenChange = (next: boolean) => {
    if (next) return;
    const steps = (subPushed.current ? 1 : 0) + (modalPushed.current ? 1 : 0);
    subPushed.current = false;
    modalPushed.current = false;
    clearSub();
    onOpenChange(false);
    if (steps > 0) window.history.go(-steps);
  };

  // Leave the sub-state via a Back so the pushed entry is unwound cleanly.
  const exitSub = () => {
    if (subPushed.current) window.history.back();
    else clearSub();
  };

  const startEdit = (cat: TaskCategoryRow) => {
    setErrorMsg(null);
    setConfirmDeleteId(null);
    setAdding(false);
    setEditingId(cat.id);
    setDraft(cat.name);
  };

  const saveEdit = (id: string) => {
    const name = draft.trim();
    const cat = categories.find((c) => c.id === id);
    if (name && cat && name !== cat.name) {
      update.mutate(
        { id, patch: { name } },
        { onError: () => setErrorMsg('Couldn’t rename the category.') }
      );
    }
    exitSub();
  };

  const startAdd = () => {
    setErrorMsg(null);
    setEditingId(null);
    setConfirmDeleteId(null);
    setNewName('');
    setAdding(true);
  };

  const saveAdd = () => {
    const name = newName.trim();
    if (name) {
      create.mutate({ name }, { onError: () => setErrorMsg('Couldn’t add the category.') });
    }
    exitSub();
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
          <DialogDescription>Rename, delete, or add task categories.</DialogDescription>
        </DialogHeader>

        {errorMsg && <p className="text-destructive text-sm">{errorMsg}</p>}

        <div className="-mx-1 max-h-[55vh] space-y-1 overflow-y-auto px-1">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="hover:bg-muted/40 flex items-center gap-2 rounded-xl px-3 py-2"
            >
              {editingId === cat.id ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Escape is left to the Dialog (closes the modal) so it
                      // isn't handled twice; Enter commits the rename.
                      if (e.key === 'Enter') saveEdit(cat.id);
                    }}
                    className="border-border bg-background focus-visible:ring-ring h-9 w-full min-w-0 flex-1 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2"
                  />
                  <IconBtn label="Save" onClick={() => saveEdit(cat.id)}>
                    <Check className="text-primary h-4 w-4" />
                  </IconBtn>
                  <IconBtn label="Cancel" onClick={exitSub}>
                    <X className="h-4 w-4" />
                  </IconBtn>
                </>
              ) : confirmDeleteId === cat.id ? (
                <>
                  <span className="text-muted-foreground flex-1 truncate text-sm">
                    Delete “{cat.name}”?
                  </span>
                  <button
                    type="button"
                    onClick={exitSub}
                    className="hover:bg-muted rounded-lg px-2 py-1 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      del.mutate(cat.id, {
                        onError: () => setErrorMsg('Couldn’t delete the category.'),
                      });
                      exitSub();
                    }}
                    className="bg-destructive rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm font-medium">{cat.name}</span>
                  <IconBtn label={`Edit ${cat.name}`} onClick={() => startEdit(cat)}>
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    label={`Delete ${cat.name}`}
                    onClick={() => {
                      setErrorMsg(null);
                      setEditingId(null);
                      setAdding(false);
                      setConfirmDeleteId(cat.id);
                    }}
                  >
                    <Trash2 className="text-destructive h-4 w-4" />
                  </IconBtn>
                </>
              )}
            </div>
          ))}

          {adding && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New category"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveAdd();
                }}
                className="border-border bg-background focus-visible:ring-ring h-9 w-full min-w-0 flex-1 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2"
              />
              <IconBtn label="Save" onClick={saveAdd}>
                <Check className="text-primary h-4 w-4" />
              </IconBtn>
              <IconBtn label="Cancel" onClick={exitSub}>
                <X className="h-4 w-4" />
              </IconBtn>
            </div>
          )}

          {categories.length === 0 && !adding && (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              No categories yet.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={startAdd}
            disabled={adding}
            aria-label="Add category"
            title="Add category"
            className="bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
    >
      {children}
    </button>
  );
}
