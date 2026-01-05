'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = 'DD/MM/YYYY',
  disabled = false,
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(date ? format(date, 'dd/MM/yyyy') : '');

  // Update input when date prop changes externally
  React.useEffect(() => {
    if (date) {
      setInputValue(format(date, 'dd/MM/yyyy'));
    } else {
      setInputValue('');
    }
  }, [date]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Try to parse the date as user types
    if (value.length === 10) {
      const parsedDate = parse(value, 'dd/MM/yyyy', new Date());
      // Validate that the formatted date matches input (prevents date rollover like 31/02 -> 02/03)
      if (isValid(parsedDate) && format(parsedDate, 'dd/MM/yyyy') === value) {
        onDateChange(parsedDate);
      }
    } else if (value === '') {
      onDateChange(undefined);
    }
  };

  const handleInputBlur = () => {
    // On blur, try to parse and validate
    if (inputValue) {
      const parsedDate = parse(inputValue, 'dd/MM/yyyy', new Date());
      // Validate that the formatted date matches input (prevents date rollover)
      if (isValid(parsedDate) && format(parsedDate, 'dd/MM/yyyy') === inputValue) {
        onDateChange(parsedDate);
        setInputValue(format(parsedDate, 'dd/MM/yyyy'));
      } else {
        // Reset to the current date value or empty
        setInputValue(date ? format(date, 'dd/MM/yyyy') : '');
      }
    }
  };

  const handleCalendarSelect = (selectedDate: Date | undefined) => {
    onDateChange(selectedDate);
    if (selectedDate) {
      setInputValue(format(selectedDate, 'dd/MM/yyyy'));
    }
    setOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        disabled={disabled}
        className="flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled}
            className={cn('shrink-0', !date && 'text-muted-foreground')}
            type="button"
          >
            <CalendarIcon className="h-4 w-4" />
            <span className="sr-only">Open calendar</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleCalendarSelect}
            captionLayout="dropdown"
            fromYear={2000}
            toYear={2100}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
