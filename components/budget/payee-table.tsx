'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type BudgetPayee, type BudgetCategoryGroup } from '@/lib/utils/budget';
import { useUpdatePayee } from '@/lib/hooks/use-budget';

interface PayeeTableProps {
  payees: BudgetPayee[];
  categoryGroups: BudgetCategoryGroup[];
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onEdit: (payee: BudgetPayee) => void;
  onDelete: (payee: BudgetPayee) => void;
}

export function PayeeTable({
  payees,
  categoryGroups,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  onEdit,
  onDelete,
}: PayeeTableProps) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const updatePayee = useUpdatePayee();

  // Support both controlled and uncontrolled selection
  const selectedIds = controlledSelectedIds ?? internalSelectedIds;
  const setSelectedIds = onSelectionChange ?? setInternalSelectedIds;

  const allSelected = payees.length > 0 && selectedIds.size === payees.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < payees.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(payees.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleCategoryChange = (payeeId: string, categoryId: string) => {
    updatePayee.mutate({
      id: payeeId,
      categoryId: categoryId === '__none__' ? null : categoryId,
    });
  };

  if (payees.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p>No payees created yet</p>
        <p className="mt-1 text-sm">Payees are automatically created when you add transactions</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="w-8 px-1 py-2 text-left sm:w-10 sm:px-2 sm:py-3">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all"
              />
            </th>
            <th className="text-muted-foreground px-2 py-2 text-left text-xs font-medium tracking-wider uppercase sm:px-4 sm:py-3">
              Payee
            </th>
            <th className="text-muted-foreground px-2 py-2 text-left text-xs font-medium tracking-wider uppercase sm:px-4 sm:py-3">
              Category
            </th>
            <th className="w-8 px-1 py-2 sm:w-10 sm:px-2 sm:py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {payees.map((payee) => (
            <tr key={payee.id} className="hover:bg-muted/50 transition-colors">
              <td className="px-1 py-2 sm:px-2 sm:py-3">
                <Checkbox
                  checked={selectedIds.has(payee.id)}
                  onCheckedChange={(checked) => toggleSelect(payee.id, !!checked)}
                  aria-label={`Select ${payee.name}`}
                />
              </td>
              <td className="px-2 py-2 sm:px-4 sm:py-3">
                <span className="text-sm font-medium">{payee.name}</span>
              </td>
              <td className="px-2 py-2 sm:px-4 sm:py-3">
                <Select
                  value={payee.categoryId || '__none__'}
                  onValueChange={(value) => handleCategoryChange(payee.id, value)}
                  disabled={updatePayee.isPending}
                >
                  <SelectTrigger
                    aria-label={`Select default category for ${payee.name}`}
                    className={cn(
                      'h-auto w-full max-w-[140px] border-0 bg-transparent px-1 py-1 text-sm whitespace-normal shadow-none sm:max-w-[180px]',
                      'hover:bg-muted/50 focus:ring-0 focus:ring-offset-0',
                      !payee.categoryId && 'text-muted-foreground italic'
                    )}
                  >
                    <SelectValue placeholder="No default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="italic">No default</span>
                    </SelectItem>
                    {categoryGroups.map((group) => (
                      <SelectGroup key={group.id}>
                        <SelectLabel className="text-foreground text-xs font-semibold tracking-wide uppercase">
                          {group.name}
                        </SelectLabel>
                        {group.categories.map((category) => (
                          <SelectItem
                            key={category.id}
                            value={category.id}
                            className="text-muted-foreground"
                          >
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-1 py-2 sm:px-2 sm:py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(payee)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(payee)} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
