'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DashboardCurrency = 'ILS' | 'USD';

interface CurrencySelectorProps {
  currency: DashboardCurrency;
  onCurrencyChange: (currency: DashboardCurrency) => void;
  disabled?: boolean;
}

export function CurrencySelector({ currency, onCurrencyChange, disabled }: CurrencySelectorProps) {
  return (
    <div className="bg-muted/50 flex items-center gap-1 rounded-lg border p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCurrencyChange('ILS')}
        aria-label="Show values in ILS"
        title="ILS"
        aria-pressed={currency === 'ILS'}
        className={cn(
          'h-7 w-7 p-0 text-sm font-semibold',
          currency === 'ILS' ? 'bg-background shadow-sm' : 'hover:bg-transparent'
        )}
      >
        ₪
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCurrencyChange('USD')}
        disabled={disabled}
        aria-label="Show values in USD"
        title="USD"
        aria-pressed={currency === 'USD'}
        className={cn(
          'h-7 w-7 p-0 text-sm font-semibold',
          currency === 'USD' ? 'bg-background shadow-sm' : 'hover:bg-transparent',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        $
      </Button>
    </div>
  );
}
