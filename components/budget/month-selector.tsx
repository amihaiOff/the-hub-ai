'use client';

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatMonth, getPreviousMonth, getNextMonth, getCurrentMonth } from '@/lib/utils/budget';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface MonthSelectorProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function MonthSelector({ selectedMonth, onMonthChange }: MonthSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentMonth = getCurrentMonth();

  // Parse selected month for the picker view
  const [selectedYear] = selectedMonth.split('-').map(Number);
  const [viewYear, setViewYear] = useState(selectedYear);

  const handlePrevMonth = () => {
    onMonthChange(getPreviousMonth(selectedMonth));
  };

  const handleNextMonth = () => {
    onMonthChange(getNextMonth(selectedMonth));
  };

  const handleMonthSelect = (monthIndex: number) => {
    const month = `${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    onMonthChange(month);
    setIsOpen(false);
  };

  const handlePrevYear = () => {
    setViewYear((y) => y - 1);
  };

  const handleNextYear = () => {
    setViewYear((y) => y + 1);
  };

  const handleToday = () => {
    const [currentYear] = currentMonth.split('-').map(Number);
    setViewYear(currentYear);
    onMonthChange(currentMonth);
    setIsOpen(false);
  };

  // Reset view year when popover opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setViewYear(selectedYear);
    }
    setIsOpen(open);
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous month</span>
      </Button>

      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="min-w-[130px] justify-center gap-2 text-sm sm:min-w-[160px]"
          >
            <Calendar className="h-4 w-4" />
            {formatMonth(selectedMonth)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-3" align="center">
          {/* Year navigation */}
          <div className="mb-3 flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevYear}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold">{viewYear}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextYear}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((monthName, index) => {
              const monthValue = `${viewYear}-${String(index + 1).padStart(2, '0')}`;
              const isSelected = monthValue === selectedMonth;
              const isCurrent = monthValue === currentMonth;
              const [currentYear, currentMonthIdx] = currentMonth.split('-').map(Number);
              const isFuture =
                viewYear > currentYear || (viewYear === currentYear && index + 1 > currentMonthIdx);

              return (
                <Button
                  key={monthName}
                  variant={isSelected ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleMonthSelect(index)}
                  className={cn(
                    'h-9',
                    isCurrent && !isSelected && 'ring-primary ring-1',
                    isFuture && !isSelected && 'text-muted-foreground'
                  )}
                >
                  {monthName}
                </Button>
              );
            })}
          </div>

          {/* Today button */}
          <div className="mt-3 border-t pt-3">
            <Button variant="ghost" size="sm" className="w-full" onClick={handleToday}>
              Go to current month
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8">
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next month</span>
      </Button>
    </div>
  );
}
