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
  const createAccount = useCreateAccount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      await createAccount.mutateAsync({
        name: name.trim(),
        broker: broker.trim() || undefined,
        currency,
      });
      setName('');
      setBroker('');
      setCurrency('USD');
      setOpen(false);
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              <p className="text-xs text-muted-foreground">
                Currency for cost basis and valuations in this account
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createAccount.isPending}>
              {createAccount.isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
