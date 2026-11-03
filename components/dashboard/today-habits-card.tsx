'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HabitDayList, useTodayHabits } from '@/components/habits/habit-day-list';

/** Dashboard tile: the signed-in person's habits scheduled today. Hidden on empty days. */
export function TodayHabitsCard() {
  const { now, today, logs, scheduled } = useTodayHabits();
  if (scheduled.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Today&apos;s habits</span>
          <Link
            href="/habits"
            className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-xs font-normal"
          >
            All habits <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <HabitDayList date={today} habits={scheduled} logs={logs.data ?? []} now={now} />
      </CardContent>
    </Card>
  );
}
