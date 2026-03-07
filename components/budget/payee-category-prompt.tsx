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
import { useUpdatePayee } from '@/lib/hooks/use-budget';

type PromptStep =
  | { type: 'set-default' }
  | { type: 'change-default'; oldCategoryName: string }
  | { type: 'recategorize' };

interface PayeeCategoryPromptProps {
  open: boolean;
  onClose: () => void;
  payeeId: string;
  payeeName: string;
  categoryId: string;
  categoryName: string;
  /** null if payee has no default, otherwise the current default category name */
  oldDefaultCategoryName: string | null;
}

export function PayeeCategoryPrompt({
  open,
  onClose,
  payeeId,
  payeeName,
  categoryId,
  categoryName,
  oldDefaultCategoryName,
}: PayeeCategoryPromptProps) {
  const updatePayee = useUpdatePayee();

  const [step, setStep] = useState<PromptStep>(() =>
    oldDefaultCategoryName
      ? { type: 'change-default', oldCategoryName: oldDefaultCategoryName }
      : { type: 'set-default' }
  );

  const [error, setError] = useState<string | null>(null);

  const handleSetDefault = (recategorize = false) => {
    setError(null);
    updatePayee.mutate(
      {
        id: payeeId,
        categoryId,
        recategorizeTransactions: recategorize,
      },
      {
        onSuccess: onClose,
        onError: () => setError('Failed to update. Please try again.'),
      }
    );
  };

  const errorBanner = error && <p className="text-destructive text-sm">{error}</p>;

  if (step.type === 'set-default') {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Set default category?</DialogTitle>
            <DialogDescription>
              Set <strong>{categoryName}</strong> as the default category for{' '}
              <strong>{payeeName}</strong>? Future transactions from this payee will be
              automatically categorized.
            </DialogDescription>
          </DialogHeader>
          {errorBanner}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => handleSetDefault(false)} disabled={updatePayee.isPending}>
              Yes, set default
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSetDefault(true)}
              disabled={updatePayee.isPending}
            >
              Yes, set & re-categorize all
            </Button>
            <Button variant="ghost" onClick={onClose}>
              No
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (step.type === 'change-default') {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Change default category?</DialogTitle>
            <DialogDescription>
              Change the default category for <strong>{payeeName}</strong> from{' '}
              <strong>{step.oldCategoryName}</strong> to <strong>{categoryName}</strong>?
            </DialogDescription>
          </DialogHeader>
          {errorBanner}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              No
            </Button>
            <Button
              onClick={() => setStep({ type: 'recategorize' })}
              disabled={updatePayee.isPending}
            >
              Yes, change default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // step.type === 'recategorize'
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Re-categorize transactions?</DialogTitle>
          <DialogDescription>
            Also update all existing <strong>{payeeName}</strong> transactions to{' '}
            <strong>{categoryName}</strong>?
          </DialogDescription>
        </DialogHeader>
        {errorBanner}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleSetDefault(false)}
            disabled={updatePayee.isPending}
          >
            No, just change default
          </Button>
          <Button onClick={() => handleSetDefault(true)} disabled={updatePayee.isPending}>
            Yes, re-categorize all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
