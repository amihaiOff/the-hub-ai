'use client';

import { useState } from 'react';
import { Check, ChevronDown, Home, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHouseholdContext } from '@/lib/contexts/household-context';
import { cn } from '@/lib/utils';

interface HouseholdSwitcherProps {
  onCreateHousehold?: () => void;
  className?: string;
}

/**
 * Dropdown to switch between households
 */
export function HouseholdSwitcher({ onCreateHousehold, className }: HouseholdSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { households, activeHousehold, setActiveHouseholdId, isLoading } = useHouseholdContext();

  if (isLoading || !activeHousehold) {
    return <div className={cn('bg-muted h-9 w-40 animate-pulse rounded-md', className)} />;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('justify-between gap-2', className)}>
          <div className="flex items-center gap-2">
            <Home className="text-muted-foreground h-4 w-4" />
            <span className="max-w-[120px] truncate">{activeHousehold.name}</span>
          </div>
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {households.map((household) => (
          <DropdownMenuItem
            key={household.id}
            onClick={() => {
              setActiveHouseholdId(household.id);
              setOpen(false);
            }}
            className="flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            <span className="flex-1 truncate">{household.name}</span>
            {household.id === activeHousehold.id && <Check className="text-primary h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        {onCreateHousehold && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateHousehold} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Household
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
