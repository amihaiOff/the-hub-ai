'use client';

import * as React from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
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

  // One month on mobile (portrait), two side-by-side on larger screens.
  // md: 768px matches the rest of the app's mobile/desktop split; the
  // popover is compact enough that two months side-by-side don't fit
  // under it below that width.
  const [showTwoMonths, setShowTwoMonths] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setShowTwoMonths(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

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
            numberOfMonths={showTwoMonths ? 2 : 1}
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
          {/* Whole-month quick picks — one button per currently-visible
              month. Auto-update as the user navigates via < / > arrows,
              so users can page to any month and one-tap select it. On
              mobile we only render one month, so only one button here. */}
          <div
            className={cn('grid gap-2 border-t p-2', showTwoMonths ? 'grid-cols-2' : 'grid-cols-1')}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() => selectWholeMonth(visibleMonth)}
              className="justify-center"
            >
              {format(visibleMonth, 'MMM yyyy')}
            </Button>
            {showTwoMonths && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => selectWholeMonth(rightMonth)}
                className="justify-center"
              >
                {format(rightMonth, 'MMM yyyy')}
              </Button>
            )}
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
