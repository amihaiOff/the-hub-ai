'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface DeleteConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  trigger?: React.ReactNode;
  // Controlled mode props
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeleteConfirmDialog({
  title,
  description,
  onConfirm,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DeleteConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled && controlledOnOpenChange) {
      controlledOnOpenChange(value);
    } else {
      setInternalOpen(value);
    }
    // Clear error when dialog closes
    if (!value) {
      setError('');
    }
  };

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError('');
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete. Please try again.';
      setError(errorMessage);
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Only render trigger in uncontrolled mode */}
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger || (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <div role="alert" className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
