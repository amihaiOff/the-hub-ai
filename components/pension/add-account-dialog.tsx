'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreatePensionAccount } from '@/lib/hooks/use-pension';
import { useUpdateAssetOwners } from '@/lib/hooks/use-profiles';
import { useHouseholdContext } from '@/lib/contexts/household-context';
import { InlineOwnerPicker } from '@/components/shared';
import { PENSION_PROVIDERS, type PensionAccountType } from '@/lib/utils/pension';

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PensionAccountType>('pension');
  const [providerName, setProviderName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [feeFromDeposit, setFeeFromDeposit] = useState('');
  const [feeFromTotal, setFeeFromTotal] = useState('');
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const createAccount = useCreatePensionAccount();
  const updateOwners = useUpdateAssetOwners('pension');
  const { profile } = useHouseholdContext();

  const resetForm = () => {
    setType('pension');
    setProviderName('');
    setAccountName('');
    setCurrentValue('');
    setFeeFromDeposit('');
    setFeeFromTotal('');
    setSelectedOwnerIds([]);
    setError('');
  };

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
      // Step 1: Create account
      const newAccount = await createAccount.mutateAsync({
        type,
        providerName: providerName.trim(),
        accountName: accountName.trim(),
        currentValue: value,
        feeFromDeposit: depositFee,
        feeFromTotal: totalFee,
      });

      // Step 2: Set owners
      try {
        await updateOwners.mutateAsync({
          assetId: newAccount.id,
          profileIds: selectedOwnerIds,
        });
      } catch (ownerError) {
        console.error('Account created but failed to set owners:', ownerError);
        // Account was created - show warning, user can close dialog manually
        setError(
          'Account created but failed to assign owners. Please edit the account to set owners.'
        );
        return;
      }

      resetForm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen && profile && selectedOwnerIds.length === 0) {
          setSelectedOwnerIds([profile.id]);
        }
        if (!isOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Pension Account</DialogTitle>
            <DialogDescription>Add a new pension or hishtalmut account to track.</DialogDescription>
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
              <Label htmlFor="type">Account Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as PensionAccountType)}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pension">Pension</SelectItem>
                  <SelectItem value="hishtalmut">Hishtalmut</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="providerName">Provider *</Label>
              <Input
                id="providerName"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="e.g., Meitav, Altshuler Shaham"
                list="providers"
                required
              />
              <datalist id="providers">
                {PENSION_PROVIDERS.map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="accountName">Account Name *</Label>
              <Input
                id="accountName"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g., My Pension, Work Hishtalmut"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currentValue">Current Value (ILS) *</Label>
              <Input
                id="currentValue"
                type="number"
                step="0.01"
                min="0"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder="e.g., 100000"
                required
              />
              <p className="text-muted-foreground text-xs">
                Total value as shown in your latest statement
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="feeFromDeposit">Fee from Deposit (%) *</Label>
                <Input
                  id="feeFromDeposit"
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
                <Label htmlFor="feeFromTotal">Annual Fee (%) *</Label>
                <Input
                  id="feeFromTotal"
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                selectedOwnerIds.length === 0 || createAccount.isPending || updateOwners.isPending
              }
            >
              {createAccount.isPending || updateOwners.isPending ? 'Adding...' : 'Add Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
