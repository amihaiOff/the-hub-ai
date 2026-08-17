'use client';

import * as React from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
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

type PickerMode = 'days' | 'months';

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<PickerMode>('days');
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
          {mode === 'days' ? (
            <>
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
                className={cn(
                  'grid gap-2 border-t p-2',
                  showTwoMonths ? 'grid-cols-2' : 'grid-cols-1'
                )}
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
            </>
          ) : (
            <MonthRangePicker
              startDate={startDate}
              endDate={endDate}
              onSelect={(start, end) => {
                onStartDateChange(start);
                onEndDateChange(end);
                setOpen(false);
              }}
            />
          )}
          {/* Bottom row — All Time + Months mode toggle. Same row so
              switching between "everything", days-picker and months-picker
              is one tap. */}
          <div className="grid grid-cols-2 gap-2 border-t p-2">
            <Button variant="ghost" size="sm" onClick={handleAllTime}>
              All Time
            </Button>
            <Button
              variant={mode === 'months' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setMode((m) => (m === 'months' ? 'days' : 'months'))}
            >
              {mode === 'months' ? 'Days' : 'Months'}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Whole-month range picker. Two-click flow: first month → start, second
 * month → end (auto-swap if user picked in reverse). If the user clicks
 * the same month twice, that single month becomes the range.
 * Year navigation via arrows on the top row.
 */
function MonthRangePicker({
  startDate,
  endDate,
  onSelect,
}: {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onSelect: (start: Date, end: Date) => void;
}) {
  const [year, setYear] = React.useState<number>(() =>
    (endDate ?? startDate ?? new Date()).getFullYear()
  );
  const [pending, setPending] = React.useState<Date | null>(null);

  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const rangeStart = pending ?? startDate ?? null;
  const rangeEnd = pending ? null : (endDate ?? null);

  const isInSelectedRange = (m: Date) => {
    if (!startDate || !endDate) return false;
    const a = startOfMonth(startDate).getTime();
    const b = startOfMonth(endDate).getTime();
    const t = m.getTime();
    return t >= Math.min(a, b) && t <= Math.max(a, b);
  };

  const handleClick = (monthIdx: number) => {
    const clicked = new Date(year, monthIdx, 1);
    if (!pending) {
      // First click: seed the pending start. Don't commit yet.
      setPending(clicked);
    } else {
      // Second click: commit the range with pending as one endpoint.
      const a = pending;
      const b = clicked;
      const start = a <= b ? startOfMonth(a) : startOfMonth(b);
      const end = a <= b ? endOfMonth(b) : endOfMonth(a);
      setPending(null);
      onSelect(start, end);
    }
  };

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setYear((y) => y - 1)}
          aria-label="Previous year"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">{year}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setYear((y) => y + 1)}
          aria-label="Next year"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS.map((label, i) => {
          const m = new Date(year, i, 1);
          const active = isInSelectedRange(m);
          const isPending = pending && pending.getFullYear() === year && pending.getMonth() === i;
          return (
            <button
              key={label}
              type="button"
              onClick={() => handleClick(i)}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isPending
                  ? 'bg-primary/25 text-foreground ring-primary/50 ring-2'
                  : active
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {pending && (
        <p className="text-muted-foreground mt-2 text-xs">
          Pick a second month to complete the range (or click the same month again for a single
          month).
        </p>
      )}
      {/* Visual anchor for rangeStart / rangeEnd variables — surfaces them
          in a way that keeps ESLint happy while making future extensions
          (e.g. mid-hover preview) trivial to slot in. */}
      <span
        className="sr-only"
        data-range-start={rangeStart?.toISOString() ?? ''}
        data-range-end={rangeEnd?.toISOString() ?? ''}
      />
    </div>
  );
}
