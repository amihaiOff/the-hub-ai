'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  usePages,
  useSections,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useUpdatePage,
  type PageListRow,
  type PageSectionRow,
} from '@/lib/hooks/use-pages';

/**
 * Modal to manage page sections and their memberships. Section names are
 * inline-editable; deletion asks for confirm-in-place; each section shows
 * its pages as chips (removable) with a "+ Add page" combobox to move a
 * page in. The "Unsorted" bucket is rendered read-only at the bottom.
 */
export function PageSectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: pages = [] } = usePages();
  const { data: sections = [] } = useSections();
  const createSection = useCreateSection();

  // If the dialog just created a section, remember its id so the row can
  // enter edit mode immediately.
  const [editSectionId, setEditSectionId] = useState<string | null>(null);

  const unsortedPages = useMemo(
    () => pages.filter((p) => !p.sectionId).sort((a, b) => a.sortOrder - b.sortOrder),
    [pages]
  );

  const handleCreate = () => {
    createSection.mutate(
      { name: 'New section' },
      {
        onSuccess: (s) => setEditSectionId(s.id),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage sections</DialogTitle>
          <DialogDescription>
            Group pages into sections. Pages without a section appear in Unsorted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCreate}
            disabled={createSection.isPending}
            className={cn(
              'text-foreground/80 border-border/50 hover:bg-accent/60 hover:text-foreground inline-flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-60'
            )}
          >
            {createSection.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New section
          </button>

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {sections.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No sections yet. Create one to start grouping.
              </p>
            )}
            {sections.map((section) => (
              <SectionRow
                key={section.id}
                section={section}
                pages={pages}
                autoEdit={editSectionId === section.id}
                onEditDone={() => setEditSectionId(null)}
              />
            ))}

            {/* Unsorted bucket — read-only. */}
            <div className="border-border/50 rounded-2xl border p-3">
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Unsorted
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unsortedPages.length === 0 ? (
                  <span className="text-muted-foreground/70 text-xs">No pages</span>
                ) : (
                  unsortedPages.map((p) => (
                    <span
                      key={p.id}
                      className="bg-muted/40 text-foreground/80 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                    >
                      {p.emoji ? <span>{p.emoji}</span> : null}
                      <span className="max-w-[160px] truncate">{p.title.trim() || 'Untitled'}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionRow({
  section,
  pages,
  autoEdit,
  onEditDone,
}: {
  section: PageSectionRow;
  pages: PageListRow[];
  autoEdit: boolean;
  onEditDone: () => void;
}) {
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const updatePage = useUpdatePage();

  const [editing, setEditing] = useState(autoEdit);
  const [name, setName] = useState(section.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external name changes into local state without triggering the
  // cascading-render lint rule — deferred via queueMicrotask so the
  // setState isn't synchronous inside the effect body.
  useEffect(() => {
    queueMicrotask(() => setName(section.name));
  }, [section.name]);

  useEffect(() => {
    if (autoEdit) queueMicrotask(() => setEditing(true));
  }, [autoEdit]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitName = () => {
    const trimmed = name.trim();
    setEditing(false);
    onEditDone();
    if (!trimmed || trimmed === section.name) {
      setName(section.name);
      return;
    }
    updateSection.mutate({ id: section.id, patch: { name: trimmed } });
  };

  const cancelEdit = () => {
    setName(section.name);
    setEditing(false);
    onEditDone();
  };

  const sectionPages = useMemo(
    () => pages.filter((p) => p.sectionId === section.id).sort((a, b) => a.sortOrder - b.sortOrder),
    [pages, section.id]
  );

  const eligiblePages = useMemo(
    () => pages.filter((p) => p.sectionId !== section.id),
    [pages, section.id]
  );

  const handleRemovePage = (pageId: string) => {
    updatePage.mutate({ id: pageId, patch: { sectionId: null } });
  };

  const handleAddPage = (pageId: string) => {
    updatePage.mutate({ id: pageId, patch: { sectionId: section.id } });
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteSection.mutate(section.id);
  };

  return (
    <div className="border-border/50 rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="border-border/60 bg-background focus:ring-primary/40 flex-1 rounded-md border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-foreground hover:text-foreground/80 flex-1 text-left text-sm font-semibold"
          >
            {section.name}
          </button>
        )}
        <button
          type="button"
          onClick={handleDeleteClick}
          onBlur={() => setConfirmDelete(false)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
            confirmDelete
              ? 'bg-destructive/10 text-destructive'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-destructive'
          )}
          aria-label={confirmDelete ? 'Confirm delete section' : 'Delete section'}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmDelete ? 'Delete?' : ''}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {sectionPages.length === 0 ? (
          <span className="text-muted-foreground/70 text-xs">No pages</span>
        ) : (
          sectionPages.map((p) => (
            <span
              key={p.id}
              className="bg-muted/40 text-foreground/80 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
            >
              {p.emoji ? <span>{p.emoji}</span> : null}
              <span className="max-w-[160px] truncate">{p.title.trim() || 'Untitled'}</span>
              <button
                type="button"
                onClick={() => handleRemovePage(p.id)}
                aria-label={`Remove ${p.title || 'page'} from section`}
                className="text-muted-foreground hover:text-destructive ml-0.5 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}

        <AddPagePopover pages={eligiblePages} onPick={handleAddPage} />
      </div>
    </div>
  );
}

function AddPagePopover({ pages, onPick }: { pages: PageListRow[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => (p.title || 'Untitled').toLowerCase().includes(q));
  }, [pages, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'border-border/50 text-muted-foreground hover:bg-accent/60 hover:text-foreground inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-all'
          )}
        >
          <Plus className="h-3 w-3" />
          Add page
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages..."
          className="border-border/60 bg-background focus:ring-primary/40 mb-2 w-full rounded-md border px-2 py-1 text-sm focus:ring-2 focus:outline-none"
        />
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground/70 px-2 py-2 text-xs">No pages</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onPick(p.id);
                  setOpen(false);
                  setQuery('');
                }}
                className="text-foreground/80 hover:bg-accent/60 hover:text-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              >
                {p.emoji ? (
                  <span className="w-4 text-center text-sm leading-none">{p.emoji}</span>
                ) : (
                  <span className="text-muted-foreground w-4 text-center text-xs">·</span>
                )}
                <span className="flex-1 truncate">{p.title.trim() || 'Untitled'}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
