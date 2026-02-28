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
        className={cn(
          'h-7 px-3 text-xs font-medium',
          currency === 'ILS' ? 'bg-background shadow-sm' : 'hover:bg-transparent'
        )}
      >
        ₪ ILS
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCurrencyChange('USD')}
        disabled={disabled}
        className={cn(
          'h-7 px-3 text-xs font-medium',
          currency === 'USD' ? 'bg-background shadow-sm' : 'hover:bg-transparent',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        $ USD
      </Button>
    </div>
  );
}
