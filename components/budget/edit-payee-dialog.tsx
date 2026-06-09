'use client';

import { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useUpdatePayee, useCategoryGroups } from '@/lib/hooks/use-budget';
import { type BudgetPayee } from '@/lib/utils/budget';

interface EditPayeeDialogProps {
  payee: BudgetPayee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Inner component that receives payee as required prop
function EditPayeeForm({
  payee,
  onOpenChange,
}: {
  payee: BudgetPayee;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(payee.name);
  const [categoryId, setCategoryId] = useState(payee.categoryId || '');
  const [neverDefault, setNeverDefault] = useState(payee.neverDefault ?? false);

  const { data: categoryGroups = [] } = useCategoryGroups();
  const updatePayee = useUpdatePayee();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await updatePayee.mutateAsync({
      id: payee.id,
      name: name.trim(),
      // If neverDefault is on, the API force-clears categoryId anyway. Send
      // null to keep the client/server view consistent.
      categoryId: neverDefault ? null : categoryId || null,
      neverDefault,
    });

    onOpenChange(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit Payee</DialogTitle>
        <DialogDescription>
          Update the payee name and set a default category for future transactions.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {/* Name */}
        <div className="grid gap-2">
          <Label htmlFor="payee-name">Payee Name</Label>
          <Input id="payee-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        {/* Default Category */}
        <div className="grid gap-2">
          <Label htmlFor="payee-category">Default Category</Label>
          <Select
            value={categoryId || '__none__'}
            onValueChange={(v) => setCategoryId(v === '__none__' ? '' : v)}
            disabled={neverDefault}
          >
            <SelectTrigger>
              <SelectValue placeholder="No default category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No default category</SelectItem>
              {categoryGroups.map((group) => (
                <div key={group.id}>
                  <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
                    {group.name}
                  </div>
                  {group.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            New transactions with this payee will use this category by default
          </p>
        </div>

        {/* Never default */}
        <div className="flex items-start gap-2">
          <Checkbox
            id="payee-never-default"
            checked={neverDefault}
            onCheckedChange={(v) => setNeverDefault(v === true)}
            className="mt-0.5"
          />
          <div className="grid gap-1">
            <Label htmlFor="payee-never-default" className="cursor-pointer">
              Never set a default category
            </Label>
            <p className="text-muted-foreground text-xs">
              Skip the &quot;make this the default category?&quot; prompt for this payee, and
              don&apos;t auto-assign one during import.
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={updatePayee.isPending || !name.trim()}>
          {updatePayee.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditPayeeDialog({ payee, open, onOpenChange }: EditPayeeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {payee && <EditPayeeForm key={payee.id} payee={payee} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
