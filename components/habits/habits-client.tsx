'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDeleteHabit, useHabits, useUpdateHabit, type HabitRow } from '@/lib/hooks/use-habits';
import { ActiveHabitTable, ArchivedHabitTable } from './habit-table';
import { HabitCalendar, type HabitCalendarMode } from './habit-calendar';
import { HabitDayList, useTodayHabits } from './habit-day-list';
import { HabitSheet } from './habit-sheet';

const MODE_KEY = 'habits:calendar-mode';

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-muted/50 h-12 animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-3 py-4 text-sm">
      <span>Couldn&apos;t load habits.</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function HabitsClient() {
  const { now, today, habits: active, logs: todayLogs, scheduled } = useTodayHabits();
  const archived = useHabits(true);
  const update = useUpdateHabit();
  const del = useDeleteHabit();
  const [editing, setEditing] = useState<HabitRow | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HabitRow | null>(null);
  // The calendar view is a per-device UI preference. The calendar only renders
  // once habits have loaded on the client, so reading storage here can't
  // cause a hydration mismatch.
  const [mode, setMode] = useState<HabitCalendarMode>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(MODE_KEY) : null;
      return saved === 'month' ? 'month' : 'week';
    } catch {
      return 'week';
    }
  });
  const changeMode = (m: HabitCalendarMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  const activeList = useMemo(() => active.data ?? [], [active.data]);
  const archivedList = useMemo(() => archived.data ?? [], [archived.data]);
  const allHabits = useMemo(() => [...activeList, ...archivedList], [activeList, archivedList]);
  const archivedIds = useMemo(() => new Set(archivedList.map((h) => h.id)), [archivedList]);

  return (
    <div className="space-y-6">
      <div className="mb-10 flex items-center justify-between gap-3">
        <h1 className="page-title text-4xl font-bold tracking-tight">Habits</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add habit
        </Button>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archive">Archive</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-6">
          {/* Mobile: what's due today comes first, with big buttons. */}
          {scheduled.length > 0 && (
            <Card className="md:hidden">
              <CardHeader>
                <CardTitle className="text-base">Due today</CardTitle>
              </CardHeader>
              <CardContent>
                <HabitDayList
                  date={today}
                  habits={scheduled}
                  logs={todayLogs.data ?? []}
                  now={now}
                  onOpenHabit={setEditing}
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardContent>
                {active.isLoading ? (
                  <ListSkeleton />
                ) : active.error ? (
                  <LoadError onRetry={() => active.refetch()} />
                ) : activeList.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-10 text-center">
                    <p className="text-muted-foreground text-sm">
                      No habits yet — add one and we&apos;ll remind you when it&apos;s time.
                    </p>
                    <Button onClick={() => setEditing('new')}>
                      <Plus className="h-4 w-4" /> Add habit
                    </Button>
                  </div>
                ) : (
                  <ActiveHabitTable
                    habits={activeList}
                    todayLogs={todayLogs.data ?? []}
                    now={now}
                    onOpen={setEditing}
                  />
                )}
              </CardContent>
            </Card>

            {allHabits.length > 0 && (
              <Card>
                <CardContent>
                  <HabitCalendar
                    mode={mode}
                    onModeChange={changeMode}
                    habits={allHabits}
                    archivedIds={archivedIds}
                    now={now}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <Card>
            <CardContent>
              {archived.isLoading ? (
                <ListSkeleton />
              ) : archived.error ? (
                <LoadError onRetry={() => archived.refetch()} />
              ) : archivedList.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">Nothing archived.</p>
              ) : (
                <ArchivedHabitTable
                  habits={archivedList}
                  onRestore={(h) => update.mutate({ id: h.id, archived: false })}
                  onDelete={setConfirmDelete}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <HabitSheet habit={editing} onClose={() => setEditing(null)} />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.title}” forever?</DialogTitle>
            <DialogDescription>
              Its whole history is erased too. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() =>
                confirmDelete &&
                del.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })
              }
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
