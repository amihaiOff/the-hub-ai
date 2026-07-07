import { MoneytorBalancesCard } from '@/components/dashboard/moneytor-balances-card';
import { TasksSummaryCard } from '@/components/dashboard/tasks-summary-card';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight lg:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">What needs your attention right now.</p>
      </div>

      {/* Tasks — non-low priority, grouped by category. */}
      <TasksSummaryCard />

      {/* Bank + credit card status pulled from the Moneytor sync. Same
          card the finance dashboard renders. */}
      <MoneytorBalancesCard />
    </div>
  );
}
