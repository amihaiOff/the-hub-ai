'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export interface AutocompleteOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  currency?: string;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: AutocompleteOption) => void;
  options: AutocompleteOption[];
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  required?: boolean;
  'aria-label'?: string;
}

export function Autocomplete({
  value,
  onChange,
  onSelect,
  options,
  isLoading = false,
  placeholder,
  disabled = false,
  className,
  inputClassName,
  id,
  required,
  'aria-label': ariaLabel,
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlighted index when options change
  React.useEffect(() => {
    setHighlightedIndex(-1);
  }, [options]);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    if (value.length > 0 || options.length > 0) {
      setIsOpen(true);
    }
  };

  const handleSelect = (option: AutocompleteOption) => {
    onChange(option.value);
    onSelect?.(option);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < options.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          handleSelect(options[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const showDropdown = isOpen && (options.length > 0 || isLoading);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls={showDropdown ? `${id}-listbox` : undefined}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined
          }
          autoComplete="off"
          className={cn('uppercase', inputClassName)}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {showDropdown && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md',
            'animate-in fade-in-0 zoom-in-95'
          )}
        >
          {isLoading && options.length === 0 ? (
            <li className="flex items-center justify-center py-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </li>
          ) : options.length === 0 ? (
            <li className="py-4 text-center text-sm text-muted-foreground">
              No results found
            </li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={highlightedIndex === index}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                  handleSelect(option);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'relative flex cursor-pointer select-none items-center justify-between rounded-sm px-2 py-2 text-sm outline-none transition-colors',
                  highlightedIndex === index
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{option.value}</span>
                    {option.currency && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {option.currency}
                      </span>
                    )}
                  </div>
                  {option.label && (
                    <span className="text-xs text-muted-foreground truncate">
                      {option.label}
                    </span>
                  )}
                </div>
                {option.badge && (
                  <span
                    className={cn(
                      'ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                      option.badge === 'NASDAQ'
                        ? 'bg-blue-500/20 text-blue-400'
                        : option.badge === 'NYSE'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-orange-500/20 text-orange-400'
                    )}
                  >
                    {option.badge}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
