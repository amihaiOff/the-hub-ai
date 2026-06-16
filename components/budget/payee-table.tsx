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
import { ChevronsUpDown, EyeOff, MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type BudgetPayee, type BudgetCategoryGroup } from '@/lib/utils/budget';
import { useUpdatePayee } from '@/lib/hooks/use-budget';
import { CategoryPickerSheet } from './category-picker-sheet';

interface PayeeTableProps {
  payees: BudgetPayee[];
  categoryGroups: BudgetCategoryGroup[];
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onEdit: (payee: BudgetPayee) => void;
  onDelete: (payee: BudgetPayee) => void;
  /** Show "Blacklist" in the row menu. Used on the Payees tab. */
  onBlacklist?: (payee: BudgetPayee) => void;
  /** Show "Restore from blacklist" in the row menu. Used on the Blacklist tab. */
  onRestore?: (payee: BudgetPayee) => void;
}

export function PayeeTable({
  payees,
  categoryGroups,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  onEdit,
  onDelete,
  onBlacklist,
  onRestore,
}: PayeeTableProps) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  // Single shared category picker sheet — previously each row mounted its own
  // Radix Select with all category items, which for 1,000+ payees pushed the
  // DOM past 10k nodes and made the page noticeably slow to render and scroll.
  const [pickerForPayeeId, setPickerForPayeeId] = useState<string | null>(null);
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

  const handleCategorySelect = (categoryId: string | null) => {
    if (!pickerForPayeeId) return;
    updatePayee.mutate({ id: pickerForPayeeId, categoryId });
  };

  const pickerPayee = pickerForPayeeId
    ? (payees.find((p) => p.id === pickerForPayeeId) ?? null)
    : null;

  if (payees.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p>No payees created yet</p>
        <p className="mt-1 text-sm">Payees are automatically created when you add transactions</p>
      </div>
    );
  }

  return (
    <>
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
              <th className="text-muted-foreground hidden px-2 py-2 text-right text-xs font-medium tracking-wider uppercase sm:table-cell sm:px-4 sm:py-3">
                Txns
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{payee.name}</span>
                    {payee.neverDefault && (
                      <span
                        className="border-border bg-muted text-muted-foreground rounded-sm border px-1.5 py-0.5 text-[10px] leading-none uppercase"
                        title="This payee never gets a default category"
                      >
                        Never default
                      </span>
                    )}
                    <span className="text-muted-foreground ml-1 text-xs sm:hidden">
                      ({payee.transactionCount} txn{payee.transactionCount !== 1 ? 's' : ''})
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 sm:px-4 sm:py-3">
                  {payee.neverDefault ? (
                    <span className="text-muted-foreground text-sm italic">—</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickerForPayeeId(payee.id)}
                      disabled={updatePayee.isPending}
                      aria-label={`Select default category for ${payee.name}`}
                      className={cn(
                        'flex h-auto w-full max-w-[140px] items-center justify-between gap-1 rounded-md px-2 py-1 text-left text-sm transition-colors sm:max-w-[180px]',
                        'hover:bg-muted/50 disabled:opacity-50',
                        !payee.categoryId && 'text-muted-foreground italic'
                      )}
                    >
                      <span className="truncate">{payee.categoryName ?? 'No default'}</span>
                      <ChevronsUpDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    </button>
                  )}
                </td>
                <td className="text-muted-foreground hidden px-2 py-2 text-right text-sm tabular-nums sm:table-cell sm:px-4 sm:py-3">
                  {payee.transactionCount}
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
                      {onBlacklist && (
                        <DropdownMenuItem onClick={() => onBlacklist(payee)}>
                          <EyeOff className="mr-2 h-4 w-4" />
                          Blacklist
                        </DropdownMenuItem>
                      )}
                      {onRestore && (
                        <DropdownMenuItem onClick={() => onRestore(payee)}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Restore
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onDelete(payee)}
                        className="text-destructive"
                      >
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

      <CategoryPickerSheet
        open={pickerForPayeeId !== null}
        onOpenChange={(open) => {
          if (!open) setPickerForPayeeId(null);
        }}
        currentCategoryId={pickerPayee?.categoryId ?? null}
        categoryGroups={categoryGroups}
        onSelect={handleCategorySelect}
        title={pickerPayee ? `Default category for ${pickerPayee.name}` : 'Choose category'}
      />
    </>
  );
}
