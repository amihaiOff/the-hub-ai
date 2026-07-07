'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  // Route the Dialog's own close affordances (X / overlay / Esc) through the
  // same one-level-at-a-time logic as the Back button.
  const handleDialogOpenChange = (next: boolean) => {
    if (next) return;
    if (subPushed.current || modalPushed.current) window.history.back();
    else onOpenChange(false);
  };

  // Leave the sub-state via a Back so the pushed entry is unwound cleanly.
  const exitSub = () => {
    if (subPushed.current) window.history.back();
    else clearSub();
  };

  const startEdit = (cat: TaskCategoryRow) => {
    setConfirmDeleteId(null);
    setAdding(false);
    setEditingId(cat.id);
    setDraft(cat.name);
  };

  const saveEdit = (id: string) => {
    const name = draft.trim();
    const cat = categories.find((c) => c.id === id);
    if (name && cat && name !== cat.name) update.mutate({ id, patch: { name } });
    exitSub();
  };

  const startAdd = () => {
    setEditingId(null);
    setConfirmDeleteId(null);
    setNewName('');
    setAdding(true);
  };

  const saveAdd = () => {
    const name = newName.trim();
    if (name) create.mutate({ name });
    exitSub();
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
        </DialogHeader>

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
                      if (e.key === 'Enter') saveEdit(cat.id);
                      else if (e.key === 'Escape') exitSub();
                    }}
                    className="border-border bg-background focus-visible:ring-ring h-8 w-full min-w-0 flex-1 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2"
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
                      del.mutate(cat.id);
                      exitSub();
                    }}
                    className="bg-destructive rounded-lg px-2 py-1 text-xs font-medium text-white"
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
                  else if (e.key === 'Escape') exitSub();
                }}
                className="border-border bg-background focus-visible:ring-ring h-8 w-full min-w-0 flex-1 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2"
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
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
    >
      {children}
    </button>
  );
}
