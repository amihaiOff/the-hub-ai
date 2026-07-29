'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateProject } from '@/lib/hooks/use-wiki';

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new project's id after a successful create. */
  onCreated?: (projectId: string) => void;
}

/** Create a Wiki project (a grouping concept) inline, without leaving the list. */
export function NewProjectDialog({ open, onOpenChange, onCreated }: NewProjectDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const createProject = useCreateProject();

  const reset = () => {
    setTitle('');
    setDescription('');
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    try {
      const project = await createProject.mutateAsync({
        title: t,
        description: description.trim() || undefined,
      });
      reset();
      onOpenChange(false);
      onCreated?.(project.id);
    } catch {
      // The error is already surfaced via createProject.isError below; swallow
      // the rejection so a failed create doesn't become an unhandledrejection.
      // The dialog stays open with the entered text so the user can retry.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group related sources under a project. Sources filed under it also get a
            &ldquo;project relevance&rdquo; section when summarized.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="proj-title">Title</Label>
            <Input
              id="proj-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim() && !createProject.isPending) submit();
              }}
              placeholder="e.g. Agentic tools for DS"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc">Description (optional)</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              className="min-h-[80px] resize-y"
            />
          </div>
        </div>

        <DialogFooter>
          {createProject.isError && (
            <span className="text-destructive mr-auto self-center text-xs">
              {(createProject.error as Error).message}
            </span>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={createProject.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!title.trim() || createProject.isPending}>
            {createProject.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
