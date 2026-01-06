'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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
import { useCreateAsset } from '@/lib/hooks/use-assets';
import { useUpdateAssetOwners } from '@/lib/hooks/use-profiles';
import { useHouseholdContext } from '@/lib/contexts/household-context';
import { InlineOwnerPicker } from '@/components/shared';
import { type MiscAssetType, getAssetTypeOptions, getAssetTypeConfig } from '@/lib/utils/assets';

export function AddAssetDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MiscAssetType>('bank_deposit');
  const [name, setName] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [monthlyDeposit, setMonthlyDeposit] = useState('');
  const [maturityDate, setMaturityDate] = useState<Date | undefined>(undefined);
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const createAsset = useCreateAsset();
  const updateOwners = useUpdateAssetOwners('assets');
  const { profile } = useHouseholdContext();

  const typeConfig = getAssetTypeConfig(type);
  const assetTypeOptions = getAssetTypeOptions();

  const resetForm = () => {
    setType('bank_deposit');
    setName('');
    setCurrentValue('');
    setInterestRate('');
    setMonthlyPayment('');
    setMonthlyDeposit('');
    setMaturityDate(undefined);
    setSelectedOwnerIds([]);
    setError('');
  };

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
      // Step 1: Create asset
      const newAsset = await createAsset.mutateAsync({
        type,
        name: name.trim(),
        currentValue: value,
        interestRate: rate,
        monthlyPayment: payment,
        monthlyDeposit: deposit,
        maturityDate: maturityDate ? format(maturityDate, 'yyyy-MM-dd') : null,
      });

      // Step 2: Set owners
      try {
        await updateOwners.mutateAsync({
          assetId: newAsset.id,
          profileIds: selectedOwnerIds,
        });
      } catch (ownerError) {
        console.error('Asset created but failed to set owners:', ownerError);
        // Asset was created - show warning, user can close dialog manually
        setError('Asset created but failed to assign owners. Please edit the asset to set owners.');
        return;
      }

      resetForm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset');
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
          Add Asset
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add {typeConfig.isLiability ? 'Liability' : 'Asset'}</DialogTitle>
            <DialogDescription>{typeConfig.description}</DialogDescription>
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
              <Label htmlFor="type">Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as MiscAssetType)}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {assetTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  type === 'bank_deposit'
                    ? 'e.g., Emergency Fund'
                    : type === 'loan'
                      ? 'e.g., Car Loan'
                      : type === 'mortgage'
                        ? 'e.g., House Mortgage'
                        : 'e.g., Child Name Savings'
                }
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="currentValue">
                {typeConfig.isLiability ? 'Outstanding Balance' : 'Current Value'} (ILS) *
              </Label>
              <Input
                id="currentValue"
                type="number"
                step="0.01"
                min="0"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder="e.g., 50000"
                required
              />
              {typeConfig.isLiability && (
                <p className="text-muted-foreground text-xs">
                  Enter as positive number - it will be stored as liability
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="interestRate">Interest Rate (%) *</Label>
              <Input
                id="interestRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="e.g., 5.0"
                required
              />
            </div>

            {typeConfig.hasMonthlyPayment && (
              <div className="grid gap-2">
                <Label htmlFor="monthlyPayment">Monthly Payment (ILS) *</Label>
                <Input
                  id="monthlyPayment"
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  placeholder="e.g., 2000"
                  required
                />
              </div>
            )}

            {typeConfig.hasMonthlyDeposit && (
              <div className="grid gap-2">
                <Label htmlFor="monthlyDeposit">Monthly Deposit (ILS)</Label>
                <Input
                  id="monthlyDeposit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyDeposit}
                  onChange={(e) => setMonthlyDeposit(e.target.value)}
                  placeholder="e.g., 500"
                />
                <p className="text-muted-foreground text-xs">
                  Regular monthly contribution (optional)
                </p>
              </div>
            )}

            {typeConfig.hasMaturityDate && (
              <div className="grid gap-2">
                <Label htmlFor="maturityDate">
                  {typeConfig.isLiability ? 'Payoff Date' : 'Maturity Date'}
                </Label>
                <DatePicker
                  id="maturityDate"
                  date={maturityDate}
                  onDateChange={setMaturityDate}
                  placeholder="Select date (optional)"
                />
                <p className="text-muted-foreground text-xs">
                  {typeConfig.isLiability ? 'Expected loan payoff date' : 'When deposit matures'}
                </p>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                selectedOwnerIds.length === 0 || createAsset.isPending || updateOwners.isPending
              }
            >
              {createAsset.isPending || updateOwners.isPending ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
