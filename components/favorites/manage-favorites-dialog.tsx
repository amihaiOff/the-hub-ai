'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useRemoveFavorite,
  useReorderFavorites,
  type FavoriteRow,
} from '@/lib/hooks/use-favorites';
import type { PageListRow } from '@/lib/hooks/use-pages';
import { favoriteLabel } from './favorite-row';

interface ManageFavoritesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  favorites: FavoriteRow[];
  pages: PageListRow[];
}

/**
 * Reorder and remove favourites.
 *
 * Reordering is drag-only via a handle, posting the whole ordered id list to
 * the bulk reorder route. The alternative (up/down arrows, as in
 * `manage-tabs-dialog.tsx`) would need a per-item PATCH endpoint that exists
 * purely to set `sortOrder`, which this feature otherwise has no use for.
 *
 * No rename: a custom label would drift from the page title it came from.
 * No delete confirmation either — a favourite is one tap to re-add, unlike a
 * category that owns child records.
 *
 * Back handling lives in the parent drawer, which coordinates both levels with
 * a single popstate handler (two independent handlers would both fire on one
 * Back and over-close).
 */
export function ManageFavoritesDialog({
  open,
  onOpenChange,
  favorites,
  pages,
}: ManageFavoritesDialogProps) {
  const reorder = useReorderFavorites();
  const remove = useRemoveFavorite();

  const sensors = useSensors(
    // A distance constraint, not a delay: correct for a dedicated handle,
    // and what keeps a tap from being read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = favorites.map((f) => f.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(ids, from, to));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Manage favourites</DialogTitle>
          <DialogDescription>Drag to reorder, or remove what you no longer need.</DialogDescription>
        </DialogHeader>

        {reorder.error || remove.error ? (
          <p className="text-destructive text-sm" role="alert">
            {(reorder.error ?? remove.error)?.message}
          </p>
        ) : null}

        {favorites.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">You have no favourites yet.</p>
        ) : (
          <div className="-mx-1 max-h-[55vh] space-y-1 overflow-y-auto px-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={favorites.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {favorites.map((favorite) => (
                  <SortableFavoriteRow
                    key={favorite.id}
                    label={favoriteLabel(favorite, pages)}
                    id={favorite.id}
                    onRemove={() => remove.mutate(favorite.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SortableFavoriteRow({
  id,
  label,
  onRemove,
}: {
  id: string;
  label: string;
  onRemove: () => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'hover:bg-muted/40 flex items-center gap-2 rounded-xl px-2',
        isDragging && 'bg-muted/60 relative z-10 shadow-lg'
      )}
    >
      {/* `touch-none` is required — without it the dialog's scroll container
          swallows the gesture on iOS before dnd-kit ever sees it. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Reorder ${label}`}
        className="text-muted-foreground hover:text-foreground flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className="min-w-0 flex-1 truncate py-2 text-sm">{label}</span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} from favorites`}
        className="text-muted-foreground hover:text-destructive flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
