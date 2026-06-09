'use client';

import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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
  getCategoryWithGroup,
  getPayeeName,
} from '@/lib/utils/budget';
import { useUpdateTransaction } from '@/lib/hooks/use-budget';
import { CategoryGroupIcon, getGroupIconColor } from '@/lib/utils/category-group-icons';
export interface PayeeCategoryPromptData {
  categoryId: string;
  categoryName: string;
  payeeId: string;
  payeeName: string;
  oldDefaultCategoryName: string | null;
}

export interface TransactionRowProps {
  transaction: BudgetTransaction;
  categoryGroups: BudgetCategoryGroup[];
  payees: BudgetPayee[];
  tags: BudgetTag[];
  isSelected: boolean;
  selectionMode?: boolean;
  isExpanded?: boolean;
  onSelect: (selected: boolean) => void;
  onLongPress?: () => void;
  onTap?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onPromptPayeeCategory: (data: PayeeCategoryPromptData) => void;
}

// --- Shared hooks & sub-components ---

function useCategoryChange(
  transaction: BudgetTransaction,
  categoryGroups: BudgetCategoryGroup[],
  payees: BudgetPayee[],
  onPromptPayeeCategory: (data: PayeeCategoryPromptData) => void
) {
  const updateTransaction = useUpdateTransaction();

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
          if (payee.neverDefault) return;
          if (payee.categoryId === newCategoryId) return;
          const oldDefaultName = payee.categoryId ? getCategoryName(payee.categoryId) : null;
          onPromptPayeeCategory({
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

  return { updateTransaction, handleCategoryChange };
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

function TagDot({ tag }: { tag: BudgetTag }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('scroll', close, { capture: true });
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="-m-1.5 inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full p-1.5"
          style={{ backgroundColor: tag.color }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          aria-label={tag.name}
        />
      </TooltipTrigger>
      <TooltipContent>{tag.name}</TooltipContent>
    </Tooltip>
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
  onPromptPayeeCategory,
}: TransactionRowProps) {
  const payeeName = getPayeeName(transaction.payeeId, payees);
  const transactionTags = tags.filter((t) => transaction.tagIds.includes(t.id));
  const isIncome = transaction.type === 'income';
  const { updateTransaction, handleCategoryChange } = useCategoryChange(
    transaction,
    categoryGroups,
    payees,
    onPromptPayeeCategory
  );

  return (
    <tr className="hover:bg-muted/50 border-b transition-colors">
      {/* Checkbox */}
      <td className="w-10 px-4 py-2">
        <Checkbox checked={isSelected} onCheckedChange={onSelect} aria-label="Select transaction" />
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
  );
}

// --- Mobile row ---

export function TransactionRowMobile({
  transaction,
  categoryGroups,
  payees,
  tags,
  isSelected,
  selectionMode,
  isExpanded,
  onSelect,
  onLongPress,
  onTap,
}: TransactionRowProps) {
  const payeeName = getPayeeName(transaction.payeeId, payees);
  const transactionTags = tags.filter((t) => transaction.tagIds.includes(t.id));
  const isIncome = transaction.type === 'income';
  const groupInfo = getCategoryWithGroup(transaction.categoryId, categoryGroups);
  const iconType = isIncome ? 'income' : 'expense';
  const iconColor = getGroupIconColor(groupInfo?.groupName ?? null, { type: iconType });

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  // Suppress the synthetic click that fires after a touch ends, so a single
  // tap doesn't trigger onTap twice (touchEnd + click).
  const touchHandled = useRef(false);
  // Tap-slop tracking: if the finger moves more than TOUCH_SLOP_PX from where
  // it started, treat the gesture as a scroll/swipe and skip onTap. Otherwise
  // every list-scroll fires onTap on whatever row the swipe started on.
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchMoved = useRef(false);
  const TOUCH_SLOP_PX = 10;

  const handleTouchStart = (e: React.TouchEvent) => {
    didLongPress.current = false;
    touchMoved.current = false;
    const t = e.touches[0];
    touchStartPos.current = t ? { x: t.clientX, y: t.clientY } : null;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress?.();
    }, 500);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchHandled.current = true;
    // Suppress the synthetic click the browser emits ~50-300ms after touchend.
    // Without this, the click fires at the *original* touch coordinates, but
    // by then our onTap may have collapsed/expanded panels and shifted the
    // layout — so the click can land on Edit/Delete in a panel that wasn't
    // even there when the user tapped.
    if (e.cancelable) e.preventDefault();
    if (didLongPress.current) return;
    if (touchMoved.current) return;
    if (selectionMode) {
      onSelect(!isSelected);
    } else {
      onTap?.();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartPos.current.x;
    const dy = t.clientY - touchStartPos.current.y;
    if (dx * dx + dy * dy > TOUCH_SLOP_PX * TOUCH_SLOP_PX) {
      touchMoved.current = true;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };

  const categoryBadgeText = groupInfo
    ? groupInfo.categoryName
    : isIncome
      ? 'Income'
      : 'Uncategorized';

  return (
    <div
      className={cn(
        'bg-card border-border/40 mx-2 mt-1.5 flex items-center gap-3 rounded-xl border p-3 transition-colors duration-150 select-none',
        isExpanded ? 'mb-0 rounded-b-none border-b-0' : 'mb-1.5',
        isSelected && 'ring-primary bg-primary/10 ring-2',
        'active:bg-card/70'
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onClick={() => {
        // On mobile, touchEnd already handled this — skip the synthetic click.
        if (touchHandled.current) {
          touchHandled.current = false;
          return;
        }
        if (selectionMode) {
          onSelect(!isSelected);
        } else {
          onTap?.();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      role="button"
      tabIndex={0}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          iconColor
        )}
      >
        <CategoryGroupIcon
          groupName={groupInfo?.groupName ?? null}
          type={iconType}
          className="h-5 w-5"
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{payeeName}</span>
          {transactionTags.map((tag) => (
            <TagDot key={tag.id} tag={tag} />
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              'bg-muted/70 text-muted-foreground inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
              !groupInfo && 'italic'
            )}
          >
            {categoryBadgeText}
          </span>
        </div>
        {transaction.notes && (
          <div className="text-muted-foreground mt-1 truncate text-xs">{transaction.notes}</div>
        )}
      </div>

      <div
        dir="ltr"
        className={cn('shrink-0 text-sm font-semibold tabular-nums', isIncome && 'text-green-500')}
      >
        {isIncome ? '+' : '-'}
        <bdi>{formatCurrencyILS(transaction.amountIls)}</bdi>
      </div>
    </div>
  );
}
