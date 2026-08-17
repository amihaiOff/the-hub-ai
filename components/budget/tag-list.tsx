'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, MoreVertical, Pencil, Trash2, Loader2 } from 'lucide-react';
import { type BudgetTag, type BudgetPayee, formatCurrencyILS } from '@/lib/utils/budget';
import { useTransactions, usePayees } from '@/lib/hooks/use-budget';
import { CategoryTransactionsMini } from './category-transactions-mini';
import { TagTimeSeriesChart } from './tag-time-series-chart';

interface TagRowProps {
  tag: BudgetTag;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  payees: BudgetPayee[];
}

function TagRow({
  tag,
  isSelected,
  isExpanded,
  onToggleExpand,
  onToggleSelect,
  onEdit,
  onDelete,
  payees,
}: TagRowProps) {
  const { data: transactions = [], isLoading } = useTransactions(
    isExpanded ? { tagId: tag.id } : undefined
  );

  return (
    <div className="border-border border-b last:border-b-0">
      <div className="flex items-center gap-2 py-2 sm:gap-3 sm:py-3">
        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect()} />

        <button
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3"
        >
          <span className="text-muted-foreground shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>

          <div className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />

          <span className="truncate font-medium">{tag.name}</span>
        </button>

        <span className="text-muted-foreground hidden shrink-0 text-sm tabular-nums sm:inline">
          {tag.transactionCount} transaction{tag.transactionCount !== 1 ? 's' : ''}
        </span>

        <span className="shrink-0 text-sm font-medium tabular-nums">
          {formatCurrencyILS(tag.totalSpent)}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && (
        <div className="bg-muted/30 border-t px-3 py-2 sm:px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <CategoryTransactionsMini
                transactions={transactions}
                payees={payees}
                emptyMessage="No transactions with this tag"
              />
              {transactions.length > 0 && (
                <TagTimeSeriesChart transactions={transactions} color={tag.color} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface TagListProps {
  tags: BudgetTag[];
  selectedTagIds: string[];
  onToggleSelect: (tagId: string) => void;
  onEdit: (tag: BudgetTag) => void;
  onDelete: (tag: BudgetTag) => void;
}

export function TagList({ tags, selectedTagIds, onToggleSelect, onEdit, onDelete }: TagListProps) {
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);
  const { data: payees = [] } = usePayees();

  if (tags.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p>No tags created yet</p>
        <p className="mt-1 text-sm">Create tags to organize your transactions</p>
      </div>
    );
  }

  return (
    <div>
      {tags.map((tag) => (
        <TagRow
          key={tag.id}
          tag={tag}
          isSelected={selectedTagIds.includes(tag.id)}
          isExpanded={expandedTagId === tag.id}
          onToggleExpand={() => setExpandedTagId((prev) => (prev === tag.id ? null : tag.id))}
          onToggleSelect={() => onToggleSelect(tag.id)}
          onEdit={() => onEdit(tag)}
          onDelete={() => onDelete(tag)}
          payees={payees}
        />
      ))}
    </div>
  );
}
