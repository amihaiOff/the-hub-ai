'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateAccount } from '@/lib/hooks/use-portfolio';

interface EditAccountDialogProps {
  accountId: string;
  accountName: string;
  accountBroker: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({
  accountId,
  accountName,
  accountBroker,
  open,
  onOpenChange,
}: EditAccountDialogProps) {
  const [name, setName] = useState(accountName);
  const [broker, setBroker] = useState(accountBroker || '');
  const [error, setError] = useState('');
  const updateAccount = useUpdateAccount();

  // Reset form when dialog opens with new values
  useEffect(() => {
    if (open) {
      setName(accountName);
      setBroker(accountBroker || '');
      setError('');
    }
  }, [open, accountName, accountBroker]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Account name is required');
      return;
    }

    try {
      await updateAccount.mutateAsync({
        id: accountId,
        name: name.trim(),
        broker: broker.trim() || null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update the account name and broker information.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="edit-account-name">Account Name</Label>
              <Input
                id="edit-account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Retirement Account"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-account-broker">Broker (optional)</Label>
              <Input
                id="edit-account-broker"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="e.g., Fidelity, Vanguard"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateAccount.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateAccount.isPending}>
              {updateAccount.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
