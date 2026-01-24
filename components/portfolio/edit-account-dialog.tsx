'use client';

import { useState, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateAccount } from '@/lib/hooks/use-portfolio';
import { useUpdateAssetOwners } from '@/lib/hooks/use-profiles';
import { InlineOwnerPicker } from '@/components/shared';

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'ILS', label: 'ILS - Israeli Shekel' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
];

interface EditAccountDialogProps {
  accountId: string;
  accountName: string;
  accountBroker: string | null;
  accountCurrency?: string;
  currentOwnerIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({
  accountId,
  accountName,
  accountBroker,
  accountCurrency = 'USD',
  currentOwnerIds = [],
  open,
  onOpenChange,
}: EditAccountDialogProps) {
  // Create a key that changes when dialog opens with new values
  const dialogKey = useMemo(
    () => `${open}-${accountName}-${accountBroker}-${accountCurrency}-${currentOwnerIds.join(',')}`,
    [open, accountName, accountBroker, accountCurrency, currentOwnerIds]
  );

  const [name, setName] = useState(accountName);
  const [broker, setBroker] = useState(accountBroker || '');
  const [currency, setCurrency] = useState(accountCurrency);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>(currentOwnerIds);
  const [error, setError] = useState('');
  const [lastDialogKey, setLastDialogKey] = useState(dialogKey);
  const updateAccount = useUpdateAccount();
  const updateOwners = useUpdateAssetOwners('portfolio');

  // Reset form when dialog key changes (instead of useEffect with setState)
  if (dialogKey !== lastDialogKey) {
    setName(accountName);
    setBroker(accountBroker || '');
    setCurrency(accountCurrency);
    setSelectedOwnerIds(currentOwnerIds);
    setError('');
    setLastDialogKey(dialogKey);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Account name is required');
      return;
    }

    if (selectedOwnerIds.length === 0) {
      setError('At least one owner is required');
      return;
    }

    try {
      // Update account details
      await updateAccount.mutateAsync({
        id: accountId,
        name: name.trim(),
        broker: broker.trim() || null,
        currency,
      });

      // Update owners if changed
      const ownersChanged =
        selectedOwnerIds.length !== currentOwnerIds.length ||
        !selectedOwnerIds.every((id) => currentOwnerIds.includes(id));

      if (ownersChanged) {
        await updateOwners.mutateAsync({
          assetId: accountId,
          profileIds: selectedOwnerIds,
        });
      }

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
            <DialogDescription>Update the account name and broker information.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && (
              <div
                role="alert"
                className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
              >
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
            <div className="grid gap-2">
              <Label htmlFor="edit-account-currency">Currency *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="edit-account-currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((curr) => (
                    <SelectItem key={curr.value} value={curr.value}>
                      {curr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Currency for cost basis and valuations in this account
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Owners *</Label>
              <InlineOwnerPicker
                selectedIds={selectedOwnerIds}
                onSelectionChange={setSelectedOwnerIds}
              />
              <p className="text-muted-foreground text-xs">
                Select which profiles own this account
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateAccount.isPending || updateOwners.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                selectedOwnerIds.length === 0 || updateAccount.isPending || updateOwners.isPending
              }
            >
              {updateAccount.isPending || updateOwners.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
