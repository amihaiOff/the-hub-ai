'use client';

import * as React from 'react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
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

type PickerMode = 'days' | 'months';

export function AnalysisPeriodPicker({ value, onChange }: AnalysisPeriodPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<PickerMode>('days');

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
          {mode === 'days' ? (
            <>
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
              initialFrom={value.type === 'range' ? value.start : undefined}
              initialTo={value.type === 'range' ? value.end : undefined}
              onSelectMonth={(anchor) => selectWholeMonth(anchor)}
              onSelectRange={(start, end) => {
                onChange({ type: 'range', start, end });
                setOpen(false);
              }}
            />
          )}
          {/* Bottom row — All Time + Days/Months mode toggle. Same row so
              switching between everything, days-picker and months-picker is
              one tap. */}
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
 * Whole-month range picker used when the AnalysisPeriodPicker's mode is
 * flipped to Months. Two-click flow:
 *   1st tap → sets a pending anchor month
 *   2nd tap on the SAME month → emits `selectMonth` (single-month, uses
 *     the billing-cycle-aware month-window downstream)
 *   2nd tap on a DIFFERENT month → emits `selectRange` covering
 *     start-of-earlier-month → end-of-later-month
 *
 * Year navigation via arrows on the top row.
 */
function MonthRangePicker({
  initialFrom,
  initialTo,
  onSelectMonth,
  onSelectRange,
}: {
  initialFrom: Date | undefined;
  initialTo: Date | undefined;
  onSelectMonth: (anchor: Date) => void;
  onSelectRange: (start: Date, end: Date) => void;
}) {
  const [year, setYear] = React.useState<number>(() =>
    (initialTo ?? initialFrom ?? new Date()).getFullYear()
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

  const inCurrentSelection = (m: Date) => {
    if (!initialFrom || !initialTo) return false;
    const a = startOfMonth(initialFrom).getTime();
    const b = startOfMonth(initialTo).getTime();
    const t = m.getTime();
    return t >= Math.min(a, b) && t <= Math.max(a, b);
  };

  const handleClick = (monthIdx: number) => {
    const clicked = new Date(year, monthIdx, 1);
    if (!pending) {
      setPending(clicked);
      return;
    }
    const same =
      pending.getFullYear() === clicked.getFullYear() && pending.getMonth() === clicked.getMonth();
    if (same) {
      setPending(null);
      onSelectMonth(clicked);
      return;
    }
    const a = pending;
    const b = clicked;
    const start = a <= b ? startOfMonth(a) : startOfMonth(b);
    const end = a <= b ? endOfMonth(b) : endOfMonth(a);
    setPending(null);
    onSelectRange(start, end);
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
          const active = inCurrentSelection(m);
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
          Pick a second month for a range, or the same month again for a single month.
        </p>
      )}
    </div>
  );
}
