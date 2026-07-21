'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  Pencil,
  Search,
  Split,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import { buildAskPartnerWaLink } from '@/lib/utils/whatsapp';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  type BudgetCategoryGroup,
  type BudgetPayee,
  type BudgetTag,
  type BudgetTransaction,
  getCategoryWithGroup,
} from '@/lib/utils/budget';
import { useUpdateTransaction, type BudgetAccountName } from '@/lib/hooks/use-budget';
import { CategoryPickerSheet } from './category-picker-sheet';
import { TagPickerSheet } from './tag-picker-sheet';
import type { PayeeCategoryPromptData } from './transaction-row';

interface TransactionActionsPanelProps {
  transaction: BudgetTransaction;
  categoryGroups: BudgetCategoryGroup[];
  payees: BudgetPayee[];
  tags: BudgetTag[];
  accountNames: BudgetAccountName[];
  onEdit: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onPromptPayeeCategory: (data: PayeeCategoryPromptData) => void;
}

export function TransactionActionsPanel({
  transaction,
  categoryGroups,
  payees,
  tags,
  accountNames,
  onEdit,
  onSplit,
  onDelete,
  onPromptPayeeCategory,
}: TransactionActionsPanelProps) {
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [askPickerOpen, setAskPickerOpen] = useState(false);
  const updateTransaction = useUpdateTransaction();

  const partnerContactsQuery = useQuery({
    queryKey: ['settings', 'partner-contacts'],
    queryFn: async () => {
      const res = await fetch('/api/settings/partner-contacts');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as { id: string; name: string; phone: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const partnerContacts = partnerContactsQuery.data ?? [];

  const isIncome = transaction.type === 'income';
  const groupInfo = getCategoryWithGroup(transaction.categoryId, categoryGroups);
  const transactionTags = tags.filter((t) => transaction.tagIds.includes(t.id));

  // Resolve the friendly account name from the payment identifier, falling back to the raw value.
  const accountLabel = transaction.paymentIdentifier
    ? (accountNames.find((a) => a.accountNumber === transaction.paymentIdentifier)?.name ??
      transaction.paymentIdentifier)
    : null;

  const handleCategorySelect = (newCategoryId: string | null) => {
    updateTransaction.mutate(
      { id: transaction.id, categoryId: newCategoryId },
      {
        onSuccess: () => {
          if (!newCategoryId || !transaction.payeeId) return;
          const payee = payees.find((p) => p.id === transaction.payeeId);
          if (!payee) return;
          // Respect a "never default" payee (e.g. matched by a markNeverDefault
          // rule) — don't prompt to set/change its default category. Mirrors the
          // inline row path in transaction-row.tsx.
          if (payee.neverDefault) return;
          if (payee.categoryId === newCategoryId) return;
          const newGroupInfo = getCategoryWithGroup(newCategoryId, categoryGroups);
          const oldGroupInfo = getCategoryWithGroup(payee.categoryId, categoryGroups);
          if (!newGroupInfo) return;
          onPromptPayeeCategory({
            categoryId: newCategoryId,
            categoryName: newGroupInfo.categoryName,
            payeeId: payee.id,
            payeeName: payee.name,
            oldDefaultCategoryName: oldGroupInfo?.categoryName ?? null,
          });
        },
        onError: (error) => {
          console.error('Failed to update category:', error);
        },
      }
    );
  };

  const openWaForContact = (phone: string) => {
    const payee = payees.find((p) => p.id === transaction.payeeId);
    const url = buildAskPartnerWaLink({
      partnerPhone: phone,
      payee: payee?.name ?? transaction.notes ?? '(no payee)',
      amountIls: Number(transaction.amountIls),
      date: transaction.transactionDate,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const payeeForSearch =
    payees.find((p) => p.id === transaction.payeeId)?.name ?? transaction.notes ?? null;

  const handleSearchPayee = () => {
    if (!payeeForSearch) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(payeeForSearch)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleAskPartner = () => {
    if (partnerContacts.length === 0) return;
    if (partnerContacts.length === 1) {
      openWaForContact(partnerContacts[0].phone);
      return;
    }
    setAskPickerOpen(true);
  };

  const handleTagsChange = (nextTagIds: string[]) => {
    updateTransaction.mutate(
      { id: transaction.id, tagIds: nextTagIds },
      {
        onError: (error) => {
          console.error('Failed to update tags:', error);
        },
      }
    );
  };

  return (
    <>
      <div
        className={cn('bg-card border-border/40 mx-2 mb-1.5 rounded-b-xl border border-t-0 p-2')}
      >
        <button
          type="button"
          onClick={() => setCategoryPickerOpen(true)}
          disabled={updateTransaction.isPending}
          className={cn(
            'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
            'hover:bg-muted/60 active:bg-muted disabled:opacity-50'
          )}
        >
          <LayoutDashboard
            className="text-muted-foreground h-4 w-4 shrink-0"
            aria-label="Category"
          />
          <div
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              !groupInfo && 'text-muted-foreground italic'
            )}
          >
            {groupInfo ? groupInfo.categoryName : isIncome ? 'Income' : 'Uncategorized'}
          </div>
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        </button>

        {accountLabel && (
          <div className="flex min-h-12 w-full items-center gap-3 px-3 py-2">
            <Landmark
              className="text-muted-foreground h-4 w-4 shrink-0"
              aria-label="Account"
              role="img"
            />
            <div className="min-w-0 flex-1 truncate text-sm">{accountLabel}</div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setTagPickerOpen(true)}
          disabled={updateTransaction.isPending}
          className={cn(
            'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
            'hover:bg-muted/60 active:bg-muted disabled:opacity-50'
          )}
        >
          <TagIcon className="text-muted-foreground h-4 w-4 shrink-0" aria-label="Tags" />
          <div className="min-w-0 flex-1">
            {transactionTags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {transactionTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground truncate text-sm italic">No tags</div>
            )}
          </div>
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        </button>

        <div className="border-border/40 mt-1 grid grid-cols-5 gap-1 border-t pt-2">
          <button
            type="button"
            onClick={onEdit}
            className="hover:bg-muted/60 active:bg-muted flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            <span className="text-xs font-medium">Edit</span>
          </button>
          <button
            type="button"
            onClick={onSplit}
            disabled={transaction.isSplit}
            className="hover:bg-muted/60 active:bg-muted flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors disabled:opacity-40"
          >
            <Split className="h-4 w-4" />
            <span className="text-xs font-medium">Split</span>
          </button>
          <button
            type="button"
            onClick={handleAskPartner}
            disabled={partnerContacts.length === 0}
            title={
              partnerContacts.length === 0
                ? 'Add a WhatsApp contact in Settings first'
                : 'Ask on WhatsApp'
            }
            className="hover:bg-muted/60 active:bg-muted flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors disabled:opacity-40"
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Ask</span>
          </button>
          <button
            type="button"
            onClick={handleSearchPayee}
            disabled={!payeeForSearch}
            title={payeeForSearch ? `Search the web for "${payeeForSearch}"` : 'No payee to search'}
            className="hover:bg-muted/60 active:bg-muted flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors disabled:opacity-40"
          >
            <Search className="h-4 w-4" />
            <span className="text-xs font-medium">Search</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 active:bg-destructive/20 flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span className="text-xs font-medium">Delete</span>
          </button>
        </div>
      </div>

      <CategoryPickerSheet
        open={categoryPickerOpen}
        onOpenChange={setCategoryPickerOpen}
        currentCategoryId={transaction.categoryId}
        categoryGroups={categoryGroups}
        onSelect={handleCategorySelect}
      />

      <TagPickerSheet
        open={tagPickerOpen}
        onOpenChange={setTagPickerOpen}
        tags={tags}
        selectedTagIds={transaction.tagIds}
        onChange={handleTagsChange}
      />

      <Sheet open={askPickerOpen} onOpenChange={setAskPickerOpen}>
        <SheetContent
          side="bottom"
          className="sm:bottom-4 sm:mx-auto sm:h-auto sm:max-w-sm sm:rounded-2xl"
        >
          <SheetHeader>
            <SheetTitle>Ask on WhatsApp</SheetTitle>
          </SheetHeader>
          <div className="space-y-1 p-2">
            {partnerContacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  openWaForContact(c.phone);
                  setAskPickerOpen(false);
                }}
                className="hover:bg-muted/60 active:bg-muted flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors"
              >
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-muted-foreground text-xs">{c.phone}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
