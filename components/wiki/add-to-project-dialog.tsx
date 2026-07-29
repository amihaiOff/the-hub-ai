'use client';

import { useMemo } from 'react';
import { FolderKanban } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWikiConcepts, useAddToProject } from '@/lib/hooks/use-wiki';

interface AddToProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conceptId: string;
  /** Projects the source already belongs to — filtered out of the picker. */
  currentProjectIds: string[];
}

/** Pick a project to file the current source under. A source can belong to
 *  several projects, so this only lists the ones it isn't in yet. */
export function AddToProjectDialog({
  open,
  onOpenChange,
  conceptId,
  currentProjectIds,
}: AddToProjectDialogProps) {
  const { data } = useWikiConcepts();
  const add = useAddToProject();

  const available = useMemo(
    () =>
      (data ?? []).filter((c) => c.type === 'Project' && !currentProjectIds.includes(c.id)),
    [data, currentProjectIds]
  );

  const addTo = async (projectId: string) => {
    try {
      await add.mutateAsync({ conceptId, projectId });
      onOpenChange(false);
    } catch {
      // Error surfaced via add.isError below; keep the dialog open to retry.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) add.reset(); // clear any prior error so reopening is clean
        onOpenChange(next);
      }}
    >
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Add to project</DialogTitle>
          <DialogDescription>
            File this source under a project. It can belong to several.
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No other projects to add. Create one from the Wiki page.
          </p>
        ) : (
          <div className="-mx-1 max-h-[50vh] space-y-1 overflow-y-auto px-1">
            {available.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={add.isPending}
                onClick={() => addTo(p.id)}
                className="hover:bg-muted/60 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50"
              >
                <FolderKanban className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{p.title}</span>
              </button>
            ))}
          </div>
        )}

        {add.isError && (
          <p className="text-destructive text-xs">{(add.error as Error).message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
