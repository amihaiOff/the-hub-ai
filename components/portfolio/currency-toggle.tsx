'use client';

import { useCurrency } from '@/lib/contexts/currency-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCurrencyWithSymbol } from '@/lib/utils/portfolio';
import { AlertCircle } from 'lucide-react';

export function CurrencyToggle() {
  const { displayCurrency, setDisplayCurrency, isLoadingRates, ratesError } = useCurrency();

  const ilsDisabled = isLoadingRates || !!ratesError;

  return (
    <div className="bg-muted/50 flex items-center gap-1 rounded-lg border p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDisplayCurrency('original')}
        className={cn(
          'h-7 px-3 text-xs font-medium',
          displayCurrency === 'original' ? 'bg-background shadow-sm' : 'hover:bg-transparent'
        )}
      >
        Original
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDisplayCurrency('ILS')}
        disabled={ilsDisabled}
        title={ratesError ? 'Exchange rates unavailable' : undefined}
        className={cn(
          'h-7 px-3 text-xs font-medium',
          displayCurrency === 'ILS' ? 'bg-background shadow-sm' : 'hover:bg-transparent',
          ilsDisabled && 'cursor-not-allowed opacity-50'
        )}
      >
        {ratesError ? <AlertCircle className="text-destructive mr-1 h-3 w-3" /> : null}
        {getCurrencyWithSymbol('ILS')}
      </Button>
    </div>
  );
}
