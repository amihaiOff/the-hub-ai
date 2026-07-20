'use client';

import * as React from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * The analysis period. A `month` (YYYY-MM) is payment-method-aware downstream
 * (credit cards on the billing cycle, others on the calendar month); a `range`
 * is a plain calendar span; `all` is everything.
 */
export type AnalysisSelection =
  | { type: 'month'; month: string }
  | { type: 'range'; start: Date; end: Date }
  | { type: 'all' };

interface AnalysisPeriodPickerProps {
  value: AnalysisSelection;
  onChange: (selection: AnalysisSelection) => void;
}

function monthAnchorOf(value: AnalysisSelection): Date {
  if (value.type === 'month') {
    const [y, m] = value.month.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  if (value.type === 'range') return startOfMonth(value.end);
  return startOfMonth(new Date());
}

/** The DateRange the calendar should highlight for the current selection. */
function selectedRangeOf(value: AnalysisSelection): DateRange | undefined {
  if (value.type === 'month') {
    const anchor = monthAnchorOf(value);
    return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  }
  if (value.type === 'range') return { from: value.start, to: value.end };
  return undefined;
}

export function AnalysisPeriodPicker({ value, onChange }: AnalysisPeriodPickerProps) {
  const [open, setOpen] = React.useState(false);

  // One month on mobile (portrait), two side-by-side on larger screens.
  const [showTwoMonths, setShowTwoMonths] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setShowTwoMonths(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Pending range for the two-click custom-range selection; committed only once
  // both ends are chosen. Re-seeded from the current selection when opened.
  const [pending, setPending] = React.useState<DateRange | undefined>(() => selectedRangeOf(value));
  const [visibleMonth, setVisibleMonth] = React.useState<Date>(() => monthAnchorOf(value));
  React.useEffect(() => {
    if (open) {
      setPending(selectedRangeOf(value));
      setVisibleMonth(monthAnchorOf(value));
    }
  }, [open, value]);

  function handleSelect(range: DateRange | undefined) {
    setPending(range);
    if (range?.from && range?.to) {
      onChange({ type: 'range', start: range.from, end: range.to });
      setOpen(false);
    }
  }

  function selectWholeMonth(monthAnchor: Date) {
    onChange({ type: 'month', month: format(monthAnchor, 'yyyy-MM') });
    setOpen(false);
  }

  function handleAllTime() {
    onChange({ type: 'all' });
    setOpen(false);
  }

  const rightMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);

  const label =
    value.type === 'all'
      ? 'All Time'
      : value.type === 'month'
        ? format(monthAnchorOf(value), 'MMM yyyy')
        : `${format(value.start, 'dd/MM/yy')} – ${format(value.end, 'dd/MM/yy')}`;

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'justify-start text-left font-normal',
              value.type === 'all' && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={pending}
            onSelect={handleSelect}
            numberOfMonths={showTwoMonths ? 2 : 1}
            captionLayout="dropdown"
            fromYear={2000}
            toYear={2100}
            month={visibleMonth}
            onMonthChange={setVisibleMonth}
            showOutsideDays={false}
            initialFocus
          />
          {/* Whole-month quick picks — one button per currently-visible month.
              Selecting a month uses the billing-cycle-aware window downstream
              (credit cards 10th–9th, everything else the calendar month). */}
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
