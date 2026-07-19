'use client';

import * as React from 'react';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
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

  // Track the left-hand visible month so the "select this whole month"
  // buttons in the footer know which two months are on screen.
  const [visibleMonth, setVisibleMonth] = React.useState<Date>(() =>
    startOfMonth(endDate ?? startDate ?? new Date())
  );

  function handleSelect(range: DateRange | undefined) {
    onStartDateChange(range?.from);
    onEndDateChange(range?.to);
  }

  function handleAllTime() {
    onStartDateChange(undefined);
    onEndDateChange(undefined);
    setOpen(false);
  }

  function selectWholeMonth(monthAnchor: Date) {
    const start = startOfMonth(monthAnchor);
    const end = endOfMonth(monthAnchor);
    onStartDateChange(start);
    onEndDateChange(end);
    setOpen(false);
  }

  const now = new Date();
  const rightMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);

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
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            // Hide previous/next month overflow cells in the two-month range
            // view — combined with the range-modifier gating in
            // components/ui/calendar.tsx, this eliminates the phantom
            // endpoint highlights that used to appear on outside days.
            showOutsideDays={false}
            initialFocus
          />
          {/* Whole-month quick picks. The two big buttons follow the
              currently-visible months (they auto-update as the user
              navigates with the calendar's < / > arrows); the smaller
              chips cover the always-useful "this / last month". */}
          <div className="grid grid-cols-2 gap-2 border-t p-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => selectWholeMonth(visibleMonth)}
              className="justify-center"
            >
              {format(visibleMonth, 'MMM yyyy')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => selectWholeMonth(rightMonth)}
              className="justify-center"
            >
              {format(rightMonth, 'MMM yyyy')}
            </Button>
          </div>
          <div className="flex gap-2 px-2 pb-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => selectWholeMonth(now)}
            >
              This month
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => selectWholeMonth(subMonths(now, 1))}
            >
              Last month
            </Button>
          </div>
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
