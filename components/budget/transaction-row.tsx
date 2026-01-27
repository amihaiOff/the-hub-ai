'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { MoreHorizontal, Pencil, Trash2, Split } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type BudgetTransaction,
  type BudgetCategoryGroup,
  type BudgetPayee,
  type BudgetTag,
  formatDate,
  formatCurrencyILS,
  getPayeeName,
} from '@/lib/utils/budget';
import { useUpdateTransaction } from '@/lib/hooks/use-budget';

interface TransactionRowProps {
  transaction: BudgetTransaction;
  categoryGroups: BudgetCategoryGroup[];
  payees: BudgetPayee[];
  tags: BudgetTag[];
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSplit: () => void;
}

export function TransactionRow({
  transaction,
  categoryGroups,
  payees,
  tags,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onSplit,
}: TransactionRowProps) {
  const payeeName = getPayeeName(transaction.payeeId, payees);
  const transactionTags = tags.filter((t) => transaction.tagIds.includes(t.id));
  const isIncome = transaction.type === 'income';
  const updateTransaction = useUpdateTransaction();

  const handleCategoryChange = (categoryId: string) => {
    updateTransaction.mutate(
      {
        id: transaction.id,
        categoryId: categoryId || null,
      },
      {
        onError: (error) => {
          console.error('Failed to update category:', error);
        },
      }
    );
  };

  return (
    <tr className="hover:bg-muted/50 border-b transition-colors">
      {/* Checkbox */}
      <td className="w-10 px-2 py-2 sm:px-4">
        <Checkbox checked={isSelected} onCheckedChange={onSelect} aria-label="Select transaction" />
      </td>

      {/* Date */}
      <td className="text-muted-foreground hidden px-2 py-2 text-sm whitespace-nowrap tabular-nums sm:table-cell sm:px-4">
        {formatDate(transaction.transactionDate)}
      </td>

      {/* Payee + Date (mobile) */}
      <td className="max-w-[150px] px-2 py-2 sm:max-w-none sm:px-4">
        <div className="truncate font-medium">{payeeName}</div>
        <div className="text-muted-foreground text-xs sm:hidden">
          {formatDate(transaction.transactionDate)}
        </div>
        {transaction.notes && (
          <div className="text-muted-foreground hidden truncate text-xs sm:block">
            {transaction.notes}
          </div>
        )}
      </td>

      {/* Category */}
      <td className="hidden px-2 py-2 sm:table-cell sm:px-4">
        <Select
          value={transaction.categoryId || '__uncategorized__'}
          onValueChange={(value) =>
            handleCategoryChange(value === '__uncategorized__' ? '' : value)
          }
          disabled={updateTransaction.isPending}
        >
          <SelectTrigger
            aria-label={`Select category for ${payeeName || 'transaction'}`}
            className={cn(
              'h-auto w-full max-w-[180px] border-0 bg-transparent px-1 py-1 text-sm shadow-none',
              'hover:bg-muted/50 focus:ring-0 focus:ring-offset-0',
              !transaction.categoryId && 'text-muted-foreground italic'
            )}
          >
            <SelectValue placeholder={isIncome ? 'Income' : 'Uncategorized'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__uncategorized__">
              <span className="italic">{isIncome ? 'Income' : 'Uncategorized'}</span>
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

      {/* Tags */}
      <td className="hidden px-2 py-2 lg:table-cell lg:px-4">
        <div className="flex flex-wrap gap-1">
          {transactionTags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-2 py-0.5 text-xs text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {transactionTags.length > 2 && (
            <span className="text-muted-foreground text-xs">+{transactionTags.length - 2}</span>
          )}
        </div>
      </td>

      {/* Amount */}
      <td className="px-2 py-2 text-right whitespace-nowrap sm:px-4">
        <span className={cn('font-medium tabular-nums', isIncome ? 'text-green-500' : '')}>
          {isIncome ? '+' : '-'}
          {formatCurrencyILS(transaction.amountIls)}
        </span>
        {/* Mobile category */}
        <div className="sm:hidden">
          <Select
            value={transaction.categoryId || '__uncategorized__'}
            onValueChange={(value) =>
              handleCategoryChange(value === '__uncategorized__' ? '' : value)
            }
            disabled={updateTransaction.isPending}
          >
            <SelectTrigger
              aria-label={`Select category for ${payeeName || 'transaction'}`}
              className={cn(
                'h-auto w-full max-w-[120px] justify-end border-0 bg-transparent px-0 py-0 text-xs shadow-none',
                'hover:bg-muted/50 focus:ring-0 focus:ring-offset-0',
                'text-muted-foreground',
                !transaction.categoryId && 'italic'
              )}
            >
              <SelectValue placeholder={isIncome ? 'Income' : 'Uncategorized'} />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="__uncategorized__">
                <span className="italic">{isIncome ? 'Income' : 'Uncategorized'}</span>
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
        </div>
      </td>

      {/* Actions */}
      <td className="w-10 px-2 py-2 sm:px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            {!transaction.isSplit && (
              <DropdownMenuItem onClick={onSplit}>
                <Split className="mr-2 h-4 w-4" />
                Split
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
