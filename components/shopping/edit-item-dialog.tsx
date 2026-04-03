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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import {
  useShoppingCategories,
  useUpdateShoppingItem,
  type ShoppingItem,
} from '@/lib/hooks/use-shopping';

interface EditItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ShoppingItem | null;
}

export function EditItemDialog({ open, onOpenChange, item }: EditItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {item && <EditItemForm key={item.id} item={item} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditItemForm({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [nameHe, setNameHe] = useState(item.nameHe ?? '');
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [isDefault, setIsDefault] = useState(item.isDefault);
  const [warningDays, setWarningDays] = useState(
    item.warningDays != null ? String(item.warningDays) : ''
  );
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useShoppingCategories();
  const updateItem = useUpdateShoppingItem();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const parsedWarningDays = warningDays.trim() ? parseInt(warningDays, 10) : null;

      await updateItem.mutateAsync({
        id: item.id,
        name: name.trim(),
        nameHe: nameHe.trim() || null,
        categoryId,
        isDefault,
        warningDays: parsedWarningDays,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
    }
  };

  const canSubmit = name.trim().length > 0 && categoryId.length > 0;

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Edit Item</DialogTitle>
        <DialogDescription>Update this item in your shopping list library.</DialogDescription>
      </DialogHeader>

      {error && (
        <div className="text-destructive mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 py-4">
        {/* Item name */}
        <div className="grid gap-2">
          <Label htmlFor="edit-item-name">Item Name</Label>
          <Input
            id="edit-item-name"
            placeholder="e.g. Milk"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Hebrew name */}
        <div className="grid gap-2">
          <Label htmlFor="edit-item-name-he">Hebrew Name (optional)</Label>
          <Input
            id="edit-item-name-he"
            dir="rtl"
            placeholder="&#1513;&#1501; &#1489;&#1506;&#1489;&#1512;&#1497;&#1514;"
            value={nameHe}
            onChange={(e) => setNameHe(e.target.value)}
          />
        </div>

        {/* Category select */}
        <div className="grid gap-2">
          <Label htmlFor="edit-category">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Default cart item */}
        <div className="flex items-center gap-3">
          <Checkbox
            id="edit-is-default"
            checked={isDefault}
            onCheckedChange={(checked) => setIsDefault(Boolean(checked))}
          />
          <Label htmlFor="edit-is-default" className="cursor-pointer">
            Default cart item
          </Label>
        </div>

        {/* Warning days */}
        <div className="grid gap-2">
          <Label htmlFor="edit-warning-days">Warn after X days without purchase</Label>
          <Input
            id="edit-warning-days"
            type="number"
            min="1"
            placeholder="e.g. 14"
            value={warningDays}
            onChange={(e) => setWarningDays(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={updateItem.isPending || !canSubmit}>
          {updateItem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </DialogFooter>
    </form>
  );
}
