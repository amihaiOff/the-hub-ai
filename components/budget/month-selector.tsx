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

export function MonthSelector({ selectedMonth, onMonthChange }: MonthSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentMonth = getCurrentMonth();

  const handlePrevMonth = () => {
    onMonthChange(getPreviousMonth(selectedMonth));
  };

  const handleNextMonth = () => {
    onMonthChange(getNextMonth(selectedMonth));
  };

  const handleToday = () => {
    onMonthChange(currentMonth);
    setIsOpen(false);
  };

  // Generate months for picker (12 months back, current, 6 months forward)
  const generateMonthOptions = () => {
    const months: string[] = [];
    const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);

    for (let i = -12; i <= 6; i++) {
      const date = new Date(currentYear, currentMonthNum - 1 + i);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(month);
    }
    return months;
  };

  const monthOptions = generateMonthOptions();

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevMonth}
        className="h-8 w-8 sm:h-9 sm:w-9"
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        <span className="sr-only">Previous month</span>
      </Button>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="min-w-[140px] justify-center gap-2 text-sm sm:min-w-[180px] sm:text-base"
          >
            <Calendar className="h-4 w-4" />
            {formatMonth(selectedMonth)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="center">
          <div className="mb-2 flex items-center justify-between border-b pb-2">
            <span className="text-sm font-medium">Select Month</span>
            <Button variant="ghost" size="sm" onClick={handleToday}>
              Today
            </Button>
          </div>
          <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
            {monthOptions.map((month) => {
              const isSelected = month === selectedMonth;
              const isCurrent = month === currentMonth;
              return (
                <Button
                  key={month}
                  variant={isSelected ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    onMonthChange(month);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'justify-start text-xs',
                    isCurrent && !isSelected && 'border-primary border'
                  )}
                >
                  {formatMonth(month)}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={handleNextMonth}
        className="h-8 w-8 sm:h-9 sm:w-9"
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        <span className="sr-only">Next month</span>
      </Button>
    </div>
  );
}
