'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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
import { useUpdateAsset } from '@/lib/hooks/use-assets';
import { useUpdateAssetOwners } from '@/lib/hooks/use-profiles';
import { InlineOwnerPicker } from '@/components/shared';
import { type MiscAssetType, getAssetTypeConfig, formatAssetType } from '@/lib/utils/assets';

interface EditAssetDialogProps {
  assetId: string;
  type: MiscAssetType;
  name: string;
  currentValue: number;
  interestRate: number;
  monthlyPayment: number | null;
  monthlyDeposit: number | null;
  maturityDate: Date | string | null;
  currentOwnerIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Parse date from various formats
const parseDate = (date: Date | string | null): Date | undefined => {
  if (!date) return undefined;
  return typeof date === 'string' ? new Date(date) : date;
};

export function EditAssetDialog({
  assetId,
  type,
  name: initialName,
  currentValue: initialValue,
  interestRate: initialRate,
  monthlyPayment: initialPayment,
  monthlyDeposit: initialDeposit,
  maturityDate: initialMaturityDate,
  currentOwnerIds = [],
  open,
  onOpenChange,
}: EditAssetDialogProps) {
  // Create a key that changes when dialog opens with new values
  const dialogKey = useMemo(
    () => `${open}-${assetId}-${initialValue}-${initialName}-${currentOwnerIds.join(',')}`,
    [open, assetId, initialValue, initialName, currentOwnerIds]
  );

  const [name, setName] = useState(initialName);
  const [currentValue, setCurrentValue] = useState(String(Math.abs(initialValue)));
  const [interestRate, setInterestRate] = useState(String(initialRate));
  const [monthlyPayment, setMonthlyPayment] = useState(
    initialPayment ? String(initialPayment) : ''
  );
  const [monthlyDeposit, setMonthlyDeposit] = useState(
    initialDeposit ? String(initialDeposit) : ''
  );
  const [maturityDate, setMaturityDate] = useState<Date | undefined>(
    parseDate(initialMaturityDate)
  );
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>(currentOwnerIds);
  const [error, setError] = useState('');
  const [lastDialogKey, setLastDialogKey] = useState(dialogKey);
  const updateAsset = useUpdateAsset();
  const updateOwners = useUpdateAssetOwners('assets');

  const typeConfig = getAssetTypeConfig(type);

  // Reset state when dialog key changes
  if (dialogKey !== lastDialogKey) {
    setName(initialName);
    setCurrentValue(String(Math.abs(initialValue)));
    setInterestRate(String(initialRate));
    setMonthlyPayment(initialPayment ? String(initialPayment) : '');
    setMonthlyDeposit(initialDeposit ? String(initialDeposit) : '');
    setMaturityDate(parseDate(initialMaturityDate));
    setSelectedOwnerIds(currentOwnerIds);
    setError('');
    setLastDialogKey(dialogKey);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const value = parseFloat(currentValue);
    const rate = parseFloat(interestRate);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (isNaN(value) || value <= 0) {
      setError('Current value must be a positive number');
      return;
    }

    if (isNaN(rate) || rate < 0 || rate > 100) {
      setError('Interest rate must be between 0 and 100');
      return;
    }

    // Validate monthly payment for loans/mortgages
    let payment: number | null = null;
    if (typeConfig.hasMonthlyPayment) {
      payment = parseFloat(monthlyPayment);
      if (isNaN(payment) || payment <= 0) {
        setError('Monthly payment must be a positive number');
        return;
      }
    }

    // Validate monthly deposit for child savings
    let deposit: number | null = null;
    if (typeConfig.hasMonthlyDeposit && monthlyDeposit) {
      deposit = parseFloat(monthlyDeposit);
      if (isNaN(deposit) || deposit < 0) {
        setError('Monthly deposit must be a non-negative number');
        return;
      }
    }

    if (selectedOwnerIds.length === 0) {
      setError('At least one owner is required');
      return;
    }

    try {
      // Update asset details
      await updateAsset.mutateAsync({
        id: assetId,
        name: name.trim(),
        currentValue: value,
        interestRate: rate,
        monthlyPayment: payment,
        monthlyDeposit: deposit,
        maturityDate: maturityDate ? format(maturityDate, 'yyyy-MM-dd') : null,
      });

      // Update owners if changed
      const ownersChanged =
        selectedOwnerIds.length !== currentOwnerIds.length ||
        !selectedOwnerIds.every((id) => currentOwnerIds.includes(id));

      if (ownersChanged) {
        await updateOwners.mutateAsync({
          assetId: assetId,
          profileIds: selectedOwnerIds,
        });
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit {formatAssetType(type)}</DialogTitle>
            <DialogDescription>
              Update the details for this {typeConfig.isLiability ? 'liability' : 'asset'}.
            </DialogDescription>
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
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-currentValue">
                {typeConfig.isLiability ? 'Outstanding Balance' : 'Current Value'} (ILS) *
              </Label>
              <Input
                id="edit-currentValue"
                type="number"
                step="0.01"
                min="0"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-interestRate">Interest Rate (%) *</Label>
              <Input
                id="edit-interestRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                required
              />
            </div>

            {typeConfig.hasMonthlyPayment && (
              <div className="grid gap-2">
                <Label htmlFor="edit-monthlyPayment">Monthly Payment (ILS) *</Label>
                <Input
                  id="edit-monthlyPayment"
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  required
                />
              </div>
            )}

            {typeConfig.hasMonthlyDeposit && (
              <div className="grid gap-2">
                <Label htmlFor="edit-monthlyDeposit">Monthly Deposit (ILS)</Label>
                <Input
                  id="edit-monthlyDeposit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyDeposit}
                  onChange={(e) => setMonthlyDeposit(e.target.value)}
                />
              </div>
            )}

            {typeConfig.hasMaturityDate && (
              <div className="grid gap-2">
                <Label htmlFor="edit-maturityDate">
                  {typeConfig.isLiability ? 'Payoff Date' : 'Maturity Date'}
                </Label>
                <DatePicker
                  id="edit-maturityDate"
                  date={maturityDate}
                  onDateChange={setMaturityDate}
                  placeholder="Select date (optional)"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Owners *</Label>
              <InlineOwnerPicker
                selectedIds={selectedOwnerIds}
                onSelectionChange={setSelectedOwnerIds}
              />
              <p className="text-muted-foreground text-xs">
                Select which profiles own this {typeConfig.isLiability ? 'liability' : 'asset'}
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
                selectedOwnerIds.length === 0 || updateAsset.isPending || updateOwners.isPending
              }
            >
              {updateAsset.isPending || updateOwners.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
