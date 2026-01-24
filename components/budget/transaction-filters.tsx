'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Filter, X } from 'lucide-react';
import {
  type TransactionFilters as FilterType,
  useCategoryGroups,
  usePayees,
  useTags,
} from '@/lib/hooks/use-budget';

interface TransactionFiltersProps {
  filters: FilterType;
  onFiltersChange: (filters: FilterType) => void;
}

export function TransactionFilters({ filters, onFiltersChange }: TransactionFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: payees = [] } = usePayees();
  const { data: tags = [] } = useTags();

  const activeFilterCount = [
    filters.categoryId,
    filters.payeeId,
    filters.tagId,
    filters.type,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFiltersChange({
      ...filters,
      categoryId: undefined,
      payeeId: undefined,
      tagId: undefined,
      type: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search transactions..."
          value={filters.searchQuery || ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, searchQuery: e.target.value || undefined })
          }
          className="pl-9"
        />
      </div>

      {/* Filter Button with Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full text-xs">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filters</h4>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear all
                </Button>
              )}
            </div>

            {/* Type */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={filters.type || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    type: value === 'all' ? undefined : (value as 'income' | 'expense'),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={filters.categoryId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    categoryId: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryGroups.map((group) => (
                    <div key={group.id}>
                      <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
                        {group.name}
                      </div>
                      {group.categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payee */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Payee</label>
              <Select
                value={filters.payeeId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    payeeId: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All payees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payees</SelectItem>
                  {payees.map((payee) => (
                    <SelectItem key={payee.id} value={payee.id}>
                      {payee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tag */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Tag</label>
              <Select
                value={filters.tagId || 'all'}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    tagId: value === 'all' ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tags</SelectItem>
                  {tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Date Range</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, startDate: e.target.value || undefined })
                  }
                  placeholder="From"
                />
                <Input
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, endDate: e.target.value || undefined })
                  }
                  placeholder="To"
                />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Active filter badges
interface ActiveFilterBadgesProps {
  filters: FilterType;
  onRemoveFilter: (key: keyof FilterType) => void;
}

export function ActiveFilterBadges({ filters, onRemoveFilter }: ActiveFilterBadgesProps) {
  const { data: categoryGroups = [] } = useCategoryGroups();
  const { data: payees = [] } = usePayees();
  const { data: tags = [] } = useTags();

  const badges: { key: keyof FilterType; label: string }[] = [];

  if (filters.type) {
    badges.push({ key: 'type', label: `Type: ${filters.type}` });
  }
  if (filters.categoryId) {
    const cat = categoryGroups
      .flatMap((g) => g.categories)
      .find((c) => c.id === filters.categoryId);
    badges.push({ key: 'categoryId', label: `Category: ${cat?.name || 'Unknown'}` });
  }
  if (filters.payeeId) {
    const payee = payees.find((p) => p.id === filters.payeeId);
    badges.push({ key: 'payeeId', label: `Payee: ${payee?.name || 'Unknown'}` });
  }
  if (filters.tagId) {
    const tag = tags.find((t) => t.id === filters.tagId);
    badges.push({ key: 'tagId', label: `Tag: ${tag?.name || 'Unknown'}` });
  }
  if (filters.startDate) {
    badges.push({ key: 'startDate', label: `From: ${filters.startDate}` });
  }
  if (filters.endDate) {
    badges.push({ key: 'endDate', label: `To: ${filters.endDate}` });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map(({ key, label }) => (
        <span
          key={key}
          className="bg-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
        >
          {label}
          <button
            onClick={() => onRemoveFilter(key)}
            className="hover:bg-muted-foreground/20 rounded-full p-0.5"
            aria-label={`Remove ${label} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
