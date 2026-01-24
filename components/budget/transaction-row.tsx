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
  getCategoryWithGroup,
} from '@/lib/utils/budget';

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
  const categoryInfo = getCategoryWithGroup(transaction.categoryId, categoryGroups);
  const payeeName = getPayeeName(transaction.payeeId, payees);
  const transactionTags = tags.filter((t) => transaction.tagIds.includes(t.id));
  const isIncome = transaction.type === 'income';

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
        {categoryInfo ? (
          <div>
            <span className="text-muted-foreground text-xs">{categoryInfo.groupName}</span>
            <div className="text-sm">{categoryInfo.categoryName}</div>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm italic">
            {isIncome ? 'Income' : 'Uncategorized'}
          </span>
        )}
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
        <div className="text-muted-foreground text-xs sm:hidden">
          {categoryInfo?.categoryName || (isIncome ? 'Income' : 'Uncategorized')}
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
