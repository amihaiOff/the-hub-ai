'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateRangePickerProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const isAllTime = !startDate && !endDate;

  const selected: DateRange | undefined =
    startDate || endDate ? { from: startDate, to: endDate } : undefined;

  function handleSelect(range: DateRange | undefined) {
    onStartDateChange(range?.from);
    onEndDateChange(range?.to);
  }

  function handleAllTime() {
    onStartDateChange(undefined);
    onEndDateChange(undefined);
    setOpen(false);
  }

  const label = isAllTime
    ? 'All Time'
    : startDate && endDate
      ? `${format(startDate, 'dd/MM/yy')} – ${format(endDate, 'dd/MM/yy')}`
      : startDate
        ? `${format(startDate, 'dd/MM/yy')} – ...`
        : 'Pick dates';

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'justify-start text-left font-normal',
              isAllTime && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={2}
            captionLayout="dropdown"
            fromYear={2000}
            toYear={2100}
            defaultMonth={endDate ?? new Date()}
            initialFocus
          />
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full" onClick={handleAllTime}>
              All Time
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
