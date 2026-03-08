'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { type BudgetCategoryGroup } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';

interface CategorySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  categoryGroups: BudgetCategoryGroup[];
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  disabled?: boolean;
}

export function CategorySelect({
  value,
  onValueChange,
  categoryGroups,
  placeholder = 'Select category',
  allowNone = false,
  noneLabel = 'None',
  disabled = false,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);

  const selectedCategory = categoryGroups.flatMap((g) => g.categories).find((c) => c.id === value);

  const displayLabel = selectedCategory
    ? selectedCategory.name
    : allowNone && value === ''
      ? noneLabel
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span
            className={cn('truncate', !selectedCategory && value !== '' && 'text-muted-foreground')}
          >
            {displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            {allowNone && (
              <CommandGroup>
                <CommandItem
                  value={noneLabel}
                  onSelect={() => {
                    onValueChange('');
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')}
                  />
                  {noneLabel}
                </CommandItem>
              </CommandGroup>
            )}
            {categoryGroups.map((group) => (
              <CommandGroup key={group.id} heading={group.name}>
                {group.categories.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={`${group.name} ${cat.name}`}
                    onSelect={() => {
                      onValueChange(cat.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4', value === cat.id ? 'opacity-100' : 'opacity-0')}
                    />
                    {cat.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
