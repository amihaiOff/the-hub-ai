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
  MoreVertical,
  Pencil,
  Trash2,
  Split,
  ChevronsUpDown,
  Check,
  X,
  Tag as TagIcon,
} from 'lucide-react';
import { CategoryPickerSheet } from './category-picker-sheet';
import { CategorySelect } from './category-select';
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
import { useUpdateTransaction, useSuggestionAction } from '@/lib/hooks/use-budget';
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
        <DropdownMenuItem
          // Defer past the menu-close: Radix restores focus to the trigger as
          // the item's onClick fires, and window.confirm() inside that focus
          // handoff can be dismissed by the browser before it renders. One
          // macrotask later, focus has settled and the dialog appears.
          onSelect={() => window.setTimeout(onDelete, 0)}
          className="text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * AI-suggestion chip + approve/dismiss buttons, shown on uncategorized
 * transactions that carry a pending suggestion. `stopEvents` guards the mobile
 * card's tap handler so clicking a button doesn't also open the row.
 */
function SuggestionBar({
  transaction,
  stopEvents,
}: {
  transaction: BudgetTransaction;
  stopEvents?: boolean;
}) {
  const action = useSuggestionAction();
  if (!transaction.suggestedCategoryId) return null;

  const confidence = Math.round((transaction.suggestionConfidence ?? 0) * 100);
  // Block only the card's touch (tap/long-press) handlers. We must NOT swallow
  // clicks in the capture phase here — that would stop the event before it
  // reaches the buttons below, killing them on mobile. Each button's own
  // onClick already calls stopPropagation to shield the card's bubble-phase
  // onClick handler.
  const swallow = stopEvents
    ? {
        onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
        onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
      }
    : {};

  return (
    <div className="flex items-center gap-1" {...swallow}>
      <span className="rounded bg-yellow-400/15 px-1.5 py-0.5 text-[11px] font-medium text-yellow-700 dark:text-yellow-300">
        AI: {transaction.suggestedCategoryName ?? 'suggestion'}
        {confidence ? ` · ${confidence}%` : ''}
      </span>
      <button
        type="button"
        aria-label="Approve suggested category"
        title="Approve"
        disabled={action.isPending}
        onClick={(e) => {
          e.stopPropagation();
          action.mutate({ id: transaction.id, action: 'approve' });
        }}
        className="flex h-6 w-6 items-center justify-center rounded text-green-600 hover:bg-green-500/15 disabled:opacity-50 dark:text-green-400"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Dismiss suggestion"
        title="Dismiss"
        disabled={action.isPending}
        onClick={(e) => {
          e.stopPropagation();
          action.mutate({ id: transaction.id, action: 'dismiss' });
        }}
        className="text-muted-foreground hover:bg-muted flex h-6 w-6 items-center justify-center rounded disabled:opacity-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function TagMark({ tag }: { tag: BudgetTag }) {
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
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          aria-label={tag.name}
        >
          {/* A tag icon tinted with the tag's own colour (stroke = currentColor). */}
          <TagIcon className="h-3.5 w-3.5" style={{ color: tag.color }} />
        </button>
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
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const { updateTransaction, handleCategoryChange } = useCategoryChange(
    transaction,
    categoryGroups,
    payees,
    onPromptPayeeCategory
  );
  const groupInfo = getCategoryWithGroup(transaction.categoryId, categoryGroups);
  const categoryLabel = groupInfo ? groupInfo.categoryName : isIncome ? 'Income' : 'Uncategorized';
  const hasSuggestion = !!transaction.suggestedCategoryId;

  return (
    <tr
      className={cn(
        'hover:bg-muted/50 border-b transition-colors',
        // Light-yellow left border marks a pending AI suggestion (the row is
        // still uncategorized until approved).
        hasSuggestion && 'border-l-4 border-l-yellow-300/70 bg-yellow-400/[0.04]'
      )}
    >
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

      {/* Category — mobile opens a bottom sheet (native-feeling on touch),
          desktop uses an inline combobox with typeahead so a keyboard user
          can jump categories without a modal round-trip. */}
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={() => setCategoryPickerOpen(true)}
          disabled={updateTransaction.isPending}
          aria-label={`Select category for ${payeeName || 'transaction'}`}
          className={cn(
            'flex h-auto w-full max-w-[180px] items-center justify-between gap-1 rounded-md px-2 py-1 text-left text-sm transition-colors lg:hidden',
            'hover:bg-muted/50 disabled:opacity-50',
            !transaction.categoryId && 'text-muted-foreground italic'
          )}
        >
          <span className="truncate">{categoryLabel}</span>
          <ChevronsUpDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        </button>
        <CategoryPickerSheet
          open={categoryPickerOpen}
          onOpenChange={setCategoryPickerOpen}
          currentCategoryId={transaction.categoryId}
          categoryGroups={categoryGroups}
          onSelect={(categoryId) => handleCategoryChange(categoryId ?? '')}
        />
        <div className="hidden max-w-[220px] lg:block">
          <CategorySelect
            value={transaction.categoryId ?? ''}
            onValueChange={handleCategoryChange}
            categoryGroups={categoryGroups}
            placeholder={isIncome ? 'Income' : 'Uncategorized'}
            allowNone
            noneLabel="Uncategorized"
            disabled={updateTransaction.isPending}
          />
        </div>
        {hasSuggestion && (
          <div className="mt-1">
            <SuggestionBar transaction={transaction} />
          </div>
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
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <span
          className={cn('font-medium tabular-nums', isIncome ? 'text-green-500' : 'text-[#d4b878]')}
        >
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
  const hasSuggestion = !!transaction.suggestedCategoryId;

  return (
    <div
      className={cn(
        'bg-card border-border/40 mx-2 mt-1.5 flex items-center gap-3 rounded-xl border p-3 transition-colors duration-150 select-none',
        isExpanded ? 'mb-0 rounded-b-none border-b-0' : 'mb-1.5',
        isSelected && 'ring-primary bg-primary/10 ring-2',
        // Light-yellow border marks a pending AI suggestion.
        hasSuggestion && !isSelected && 'border-l-4 border-l-yellow-300/70',
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
          {transactionTags.length > 0 && (
            <span className="ml-1 flex shrink-0 items-center gap-1.5">
              {transactionTags.map((tag) => (
                <TagMark key={tag.id} tag={tag} />
              ))}
            </span>
          )}
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
        {hasSuggestion && (
          <div className="mt-1.5">
            <SuggestionBar transaction={transaction} stopEvents />
          </div>
        )}
        {transaction.notes && (
          <div className="text-muted-foreground mt-1 truncate text-xs">{transaction.notes}</div>
        )}
      </div>

      <div
        dir="ltr"
        className={cn(
          'shrink-0 text-sm font-semibold tabular-nums',
          isIncome ? 'text-green-500' : 'text-[#d4b878]'
        )}
      >
        {isIncome ? '+' : '-'}
        <bdi>{formatCurrencyILS(transaction.amountIls)}</bdi>
      </div>
    </div>
  );
}
