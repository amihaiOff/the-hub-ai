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
import { useCreateAccount } from '@/lib/hooks/use-portfolio';
import { useUpdateAssetOwners } from '@/lib/hooks/use-profiles';
import { useHouseholdContext } from '@/lib/contexts/household-context';
import { InlineOwnerPicker } from '@/components/shared';

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'ILS', label: 'ILS - Israeli Shekel' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
];

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [broker, setBroker] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const createAccount = useCreateAccount();
  const updateOwners = useUpdateAssetOwners('portfolio');
  const { profile } = useHouseholdContext();

  const resetForm = () => {
    setName('');
    setBroker('');
    setCurrency('USD');
    setSelectedOwnerIds([]);
    setError('');
  };

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
      // Step 1: Create account
      const newAccount = await createAccount.mutateAsync({
        name: name.trim(),
        broker: broker.trim() || undefined,
        currency,
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
            <DialogTitle>Add Brokerage Account</DialogTitle>
            <DialogDescription>
              Add a new brokerage account to track your stock holdings.
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
              <Label htmlFor="name">Account Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Fidelity Account"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="broker">Broker (optional)</Label>
              <Input
                id="broker"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="e.g., Fidelity, Robinhood, Interactive Brokers"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                selectedOwnerIds.length === 0 ||
                createAccount.isPending ||
                updateOwners.isPending
              }
            >
              {createAccount.isPending || updateOwners.isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
