'use client';

import { useState } from 'react';
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
import { MoreVertical, Pencil, Trash2, Split } from 'lucide-react';
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
import { PayeeCategoryPrompt } from './payee-category-prompt';

export interface TransactionRowProps {
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

// --- Shared hooks & sub-components ---

function useCategoryChange(
  transaction: BudgetTransaction,
  categoryGroups: BudgetCategoryGroup[],
  payees: BudgetPayee[]
) {
  const updateTransaction = useUpdateTransaction();

  const [promptState, setPromptState] = useState<{
    categoryId: string;
    categoryName: string;
    payeeId: string;
    payeeName: string;
    oldDefaultCategoryName: string | null;
  } | null>(null);

  const getCategoryName = (categoryId: string): string => {
    for (const group of categoryGroups) {
      const cat = group.categories.find((c) => c.id === categoryId);
      if (cat) return cat.name;
    }
    return 'Unknown';
  };

  const handleCategoryChange = (categoryId: string) => {
    const newCategoryId = categoryId || null;
    updateTransaction.mutate(
      {
        id: transaction.id,
        categoryId: newCategoryId,
      },
      {
        onSuccess: () => {
          if (!newCategoryId || !transaction.payeeId) return;
          const payee = payees.find((p) => p.id === transaction.payeeId);
          if (!payee) return;
          if (payee.categoryId === newCategoryId) return;
          const oldDefaultName = payee.categoryId ? getCategoryName(payee.categoryId) : null;
          setPromptState({
            categoryId: newCategoryId,
            categoryName: getCategoryName(newCategoryId),
            payeeId: payee.id,
            payeeName: payee.name,
            oldDefaultCategoryName: oldDefaultName,
          });
        },
        onError: (error) => {
          console.error('Failed to update category:', error);
        },
      }
    );
  };

  return { updateTransaction, promptState, setPromptState, handleCategoryChange };
}

function CategorySelect({
  transaction,
  categoryGroups,
  payeeName,
  isIncome,
  isPending,
  onCategoryChange,
  triggerClassName,
  align,
}: {
  transaction: BudgetTransaction;
  categoryGroups: BudgetCategoryGroup[];
  payeeName: string;
  isIncome: boolean;
  isPending: boolean;
  onCategoryChange: (categoryId: string) => void;
  triggerClassName: string;
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <Select
      value={transaction.categoryId || '__uncategorized__'}
      onValueChange={(value) => onCategoryChange(value === '__uncategorized__' ? '' : value)}
      disabled={isPending}
    >
      <SelectTrigger
        aria-label={`Select category for ${payeeName || 'transaction'}`}
        className={cn(triggerClassName, !transaction.categoryId && 'italic')}
      >
        <SelectValue placeholder={isIncome ? 'Income' : 'Uncategorized'} />
      </SelectTrigger>
      <SelectContent align={align}>
        <SelectItem value="__uncategorized__">
          <span className="italic">{isIncome ? 'Income' : 'Uncategorized'}</span>
        </SelectItem>
        {categoryGroups.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel className="text-foreground text-xs font-semibold tracking-wide uppercase">
              {group.name}
            </SelectLabel>
            {group.categories.map((category) => (
              <SelectItem key={category.id} value={category.id} className="text-muted-foreground">
                {category.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function TransactionActions({
  onEdit,
  onDelete,
  onSplit,
  isSplit,
  buttonClassName,
  iconClassName,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onSplit: () => void;
  isSplit: boolean;
  buttonClassName: string;
  iconClassName: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={buttonClassName}>
          <MoreVertical className={iconClassName} />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        {!isSplit && (
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
  );
}

// --- Desktop row ---

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
  const { updateTransaction, promptState, setPromptState, handleCategoryChange } =
    useCategoryChange(transaction, categoryGroups, payees);

  return (
    <>
      <tr className="hover:bg-muted/50 border-b transition-colors">
        {/* Checkbox */}
        <td className="w-10 px-4 py-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label="Select transaction"
          />
        </td>

        {/* Date */}
        <td className="text-muted-foreground px-4 py-2 text-sm whitespace-nowrap tabular-nums">
          {formatDate(transaction.transactionDate)}
        </td>

        {/* Payee */}
        <td className="px-4 py-2">
          <div className="truncate font-medium">{payeeName}</div>
          {transaction.notes && (
            <div className="text-muted-foreground truncate text-xs">{transaction.notes}</div>
          )}
        </td>

        {/* Category */}
        <td className="px-4 py-2">
          <CategorySelect
            transaction={transaction}
            categoryGroups={categoryGroups}
            payeeName={payeeName}
            isIncome={isIncome}
            isPending={updateTransaction.isPending}
            onCategoryChange={handleCategoryChange}
            triggerClassName={cn(
              'h-auto w-full max-w-[180px] border-0 bg-transparent px-1 py-1 text-sm shadow-none',
              'hover:bg-muted/50 focus:ring-0 focus:ring-offset-0',
              !transaction.categoryId && 'text-muted-foreground'
            )}
          />
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
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <span className={cn('font-medium tabular-nums', isIncome ? 'text-green-500' : '')}>
            {isIncome ? '+' : '-'}
            {formatCurrencyILS(transaction.amountIls)}
          </span>
        </td>

        {/* Actions */}
        <td className="w-10 px-4 py-2">
          <TransactionActions
            onEdit={onEdit}
            onDelete={onDelete}
            onSplit={onSplit}
            isSplit={transaction.isSplit}
            buttonClassName="h-8 w-8"
            iconClassName="h-4 w-4"
          />
        </td>
      </tr>

      {promptState && (
        <PayeeCategoryPrompt
          open={!!promptState}
          onClose={() => setPromptState(null)}
          payeeId={promptState.payeeId}
          payeeName={promptState.payeeName}
          categoryId={promptState.categoryId}
          categoryName={promptState.categoryName}
          oldDefaultCategoryName={promptState.oldDefaultCategoryName}
        />
      )}
    </>
  );
}

// --- Mobile row ---

export function TransactionRowMobile({
  transaction,
  categoryGroups,
  payees,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onSplit,
}: TransactionRowProps) {
  const payeeName = getPayeeName(transaction.payeeId, payees);
  const isIncome = transaction.type === 'income';
  const { updateTransaction, promptState, setPromptState, handleCategoryChange } =
    useCategoryChange(transaction, categoryGroups, payees);

  return (
    <>
      <div className="border-border/40 flex items-start gap-2 border-b px-2 py-1.5">
        {/* Checkbox */}
        <div className="flex shrink-0 items-center self-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            aria-label="Select transaction"
          />
        </div>

        {/* Left: Payee + Notes */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{payeeName}</div>
          {transaction.notes && (
            <div className="text-muted-foreground truncate text-xs">{transaction.notes}</div>
          )}
        </div>

        {/* Right: Amount + Category */}
        <div className="flex shrink-0 flex-col items-end">
          <span
            className={cn('text-sm font-medium tabular-nums', isIncome ? 'text-green-500' : '')}
          >
            {isIncome ? '+' : '-'}
            {formatCurrencyILS(transaction.amountIls)}
          </span>
          <CategorySelect
            transaction={transaction}
            categoryGroups={categoryGroups}
            payeeName={payeeName}
            isIncome={isIncome}
            isPending={updateTransaction.isPending}
            onCategoryChange={handleCategoryChange}
            align="end"
            triggerClassName={cn(
              'h-auto w-auto max-w-[120px] justify-end border-0 bg-transparent px-0 py-0 text-xs shadow-none',
              'hover:bg-muted/50 focus:ring-0 focus:ring-offset-0',
              'text-muted-foreground'
            )}
          />
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center pt-0.5">
          <TransactionActions
            onEdit={onEdit}
            onDelete={onDelete}
            onSplit={onSplit}
            isSplit={transaction.isSplit}
            buttonClassName="h-7 w-7"
            iconClassName="h-3.5 w-3.5"
          />
        </div>
      </div>

      {promptState && (
        <PayeeCategoryPrompt
          open={!!promptState}
          onClose={() => setPromptState(null)}
          payeeId={promptState.payeeId}
          payeeName={promptState.payeeName}
          categoryId={promptState.categoryId}
          categoryName={promptState.categoryName}
          oldDefaultCategoryName={promptState.oldDefaultCategoryName}
        />
      )}
    </>
  );
}
