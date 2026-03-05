'use client';

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/portfolio';
import type { AnalysisData } from '@/lib/hooks/use-budget';

interface AnalysisSummaryCardsProps {
  data: AnalysisData;
}

export function AnalysisSummaryCards({ data }: AnalysisSummaryCardsProps) {
  const totalSpent = data.monthlyTotals.reduce((s, m) => s + m.totalExpenses, 0);
  const totalBudgeted = data.monthlyTotals.reduce((s, m) => s + m.totalBudgeted, 0);
  const numMonths = data.monthlyTotals.length;
  const avgMonthly = numMonths > 0 ? totalSpent / numMonths : 0;
  const utilization = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const cards = [
    { label: 'Total Spent', value: formatCurrency(totalSpent, 'ILS') },
    { label: 'Avg Monthly', value: formatCurrency(avgMonthly, 'ILS') },
    { label: 'Total Budgeted', value: formatCurrency(totalBudgeted, 'ILS') },
    {
      label: 'Utilization',
      value: `${utilization.toFixed(1)}%`,
      color:
        utilization > 100 ? 'text-red-500' : utilization > 90 ? 'text-amber-500' : 'text-green-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-3">
            <p className="text-muted-foreground text-xs">{card.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${card.color ?? ''}`}>{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
