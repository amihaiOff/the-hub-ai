'use client';

import { useMemo } from 'react';
import { useTags, useTransactions } from '@/lib/hooks/use-budget';
import { formatCurrencyILS, type BudgetTag, type BudgetTransaction } from '@/lib/utils/budget';

export interface TagMonthTotal {
  tag: BudgetTag;
  total: number;
  count: number;
}

/**
 * Net spend per tag (expense +, income −, same sign as the Tags page). A
 * transaction with several tags counts toward each. Split children aren't
 * tagged on creation, so a split parent's tag counts unless one of its
 * children carries that same tag (then the children count instead).
 */
export function getTagMonthTotals(
  transactions: BudgetTransaction[],
  tags: BudgetTag[]
): TagMonthTotal[] {
  const byId = new Map<string, TagMonthTotal>(
    tags.map((tag) => [tag.id, { tag, total: 0, count: 0 }])
  );
  const childTags = new Set(
    transactions
      .filter((tx) => tx.originalTransactionId)
      .flatMap((tx) => tx.tagIds.map((tagId) => `${tx.originalTransactionId}:${tagId}`))
  );
  for (const tx of transactions) {
    const signed = tx.type === 'income' ? -tx.amountIls : tx.amountIls;
    for (const tagId of tx.tagIds) {
      const row = byId.get(tagId);
      if (!row || (tx.isSplit && childTags.has(`${tx.id}:${tagId}`))) continue;
      row.total += signed;
      row.count += 1;
    }
  }
  return [...byId.values()].filter((r) => r.count > 0).sort((a, b) => b.total - a.total);
}

export function TagMonthBreakdown({ month }: { month: string }) {
  const txQuery = useTransactions({ month });
  const tagsQuery = useTags();
  const rows = useMemo(
    () => getTagMonthTotals(txQuery.data ?? [], tagsQuery.data ?? []),
    [txQuery.data, tagsQuery.data]
  );

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">Tags this month</h2>
      <div className="border-border bg-card rounded-lg border">
        {txQuery.isLoading || tagsQuery.isLoading ? (
          <div className="bg-muted m-3 h-10 animate-pulse rounded" />
        ) : txQuery.isError || tagsQuery.isError ? (
          <p className="text-destructive px-4 py-3 text-sm">Failed to load tagged transactions</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground px-4 py-3 text-sm">No tagged transactions</p>
        ) : (
          rows.map(({ tag, total, count }) => (
            <div
              key={tag.id}
              className="border-border/40 flex items-center gap-2 border-b px-4 py-2.5 last:border-b-0"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 truncate text-sm">{tag.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
              <span
                className="min-w-24 shrink-0 text-right text-sm font-medium tabular-nums"
                dir="ltr"
              >
                <bdi>{formatCurrencyILS(total)}</bdi>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
