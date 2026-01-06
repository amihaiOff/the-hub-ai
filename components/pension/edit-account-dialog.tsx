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
import { useUpdatePensionAccount } from '@/lib/hooks/use-pension';
import { useUpdateAssetOwners } from '@/lib/hooks/use-profiles';
import { InlineOwnerPicker } from '@/components/shared';
import { PENSION_PROVIDERS } from '@/lib/utils/pension';

interface EditAccountDialogProps {
  accountId: string;
  providerName: string;
  accountName: string;
  currentValue: number;
  feeFromDeposit: number;
  feeFromTotal: number;
  currentOwnerIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({
  accountId,
  providerName: initialProviderName,
  accountName: initialAccountName,
  currentValue: initialCurrentValue,
  feeFromDeposit: initialFeeFromDeposit,
  feeFromTotal: initialFeeFromTotal,
  currentOwnerIds = [],
  open,
  onOpenChange,
}: EditAccountDialogProps) {
  // Create a key that changes when dialog opens with new values
  const dialogKey = useMemo(
    () =>
      `${open}-${initialProviderName}-${initialAccountName}-${initialCurrentValue}-${initialFeeFromDeposit}-${initialFeeFromTotal}-${currentOwnerIds.join(',')}`,
    [
      open,
      initialProviderName,
      initialAccountName,
      initialCurrentValue,
      initialFeeFromDeposit,
      initialFeeFromTotal,
      currentOwnerIds,
    ]
  );

  const [providerName, setProviderName] = useState(initialProviderName);
  const [accountName, setAccountName] = useState(initialAccountName);
  const [currentValue, setCurrentValue] = useState(String(initialCurrentValue));
  const [feeFromDeposit, setFeeFromDeposit] = useState(String(initialFeeFromDeposit));
  const [feeFromTotal, setFeeFromTotal] = useState(String(initialFeeFromTotal));
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>(currentOwnerIds);
  const [error, setError] = useState('');
  const [lastDialogKey, setLastDialogKey] = useState(dialogKey);
  const updateAccount = useUpdatePensionAccount();
  const updateOwners = useUpdateAssetOwners('pension');

  // Reset state when dialog key changes (instead of useEffect with setState)
  if (dialogKey !== lastDialogKey) {
    setProviderName(initialProviderName);
    setAccountName(initialAccountName);
    setCurrentValue(String(initialCurrentValue));
    setFeeFromDeposit(String(initialFeeFromDeposit));
    setFeeFromTotal(String(initialFeeFromTotal));
    setSelectedOwnerIds(currentOwnerIds);
    setError('');
    setLastDialogKey(dialogKey);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const value = parseFloat(currentValue);
    const depositFee = parseFloat(feeFromDeposit);
    const totalFee = parseFloat(feeFromTotal);

    if (!providerName.trim()) {
      setError('Provider name is required');
      return;
    }

    if (!accountName.trim()) {
      setError('Account name is required');
      return;
    }

    if (isNaN(value) || value < 0) {
      setError('Current value must be a non-negative number');
      return;
    }

    if (isNaN(depositFee) || depositFee < 0 || depositFee > 100) {
      setError('Fee from deposit must be between 0 and 100');
      return;
    }

    if (isNaN(totalFee) || totalFee < 0 || totalFee > 100) {
      setError('Fee from total must be between 0 and 100');
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
        providerName: providerName.trim(),
        accountName: accountName.trim(),
        currentValue: value,
        feeFromDeposit: depositFee,
        feeFromTotal: totalFee,
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
            <DialogDescription>Update account details and current value.</DialogDescription>
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
              <Label htmlFor="edit-providerName">Provider *</Label>
              <Input
                id="edit-providerName"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="e.g., Meitav, Altshuler Shaham"
                list="edit-providers"
                required
              />
              <datalist id="edit-providers">
                {PENSION_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-accountName">Account Name *</Label>
              <Input
                id="edit-accountName"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g., My Pension"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-currentValue">Current Value (ILS) *</Label>
              <Input
                id="edit-currentValue"
                type="number"
                step="0.01"
                min="0"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder="e.g., 100000"
                required
              />
              <p className="text-muted-foreground text-xs">
                Update with your latest statement value
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-feeFromDeposit">Fee from Deposit (%) *</Label>
                <Input
                  id="edit-feeFromDeposit"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={feeFromDeposit}
                  onChange={(e) => setFeeFromDeposit(e.target.value)}
                  placeholder="e.g., 0.5"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-feeFromTotal">Annual Fee (%) *</Label>
                <Input
                  id="edit-feeFromTotal"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={feeFromTotal}
                  onChange={(e) => setFeeFromTotal(e.target.value)}
                  placeholder="e.g., 0.3"
                  required
                />
              </div>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
