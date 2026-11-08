'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useIsMobileViewport } from '@/lib/hooks/use-is-mobile-viewport';
import {
  useDeleteHabit,
  useHabitLogs,
  useHabits,
  useUpdateHabit,
  type HabitRow,
} from '@/lib/hooks/use-habits';
import { addDays } from '@/lib/utils/israel-time';
import { israelClock, sundayOf } from '@/lib/habits/schedule';
import { ArchivedHabitDirectory, HabitDirectory } from './habit-directory';
import { HabitCalendar, type HabitCalendarMode } from './habit-calendar';
import { useNow } from './habit-day-list';
import { HabitTimeline, HabitUpNext, HabitWeekStrip, dayEntries, pickUpNext } from './habit-agenda';
import { HabitSheet } from './habit-sheet';

const MODE_KEY = 'habits:calendar-mode';
const SECTION_LABEL = 'text-muted-foreground mb-3 text-xs font-bold tracking-widest uppercase';

const dayTitle = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-muted/50 h-16 animate-pulse rounded-2xl" />
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
  const now = useNow();
  const today = israelClock(now).today;
  const active = useHabits();
  const archived = useHabits(true);
  const update = useUpdateHabit();
  const del = useDeleteHabit();
  const isMobile = useIsMobileViewport();

  const [view, setView] = useState<'active' | 'archive'>('active');
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<HabitRow | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HabitRow | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Per-device UI preference. The calendar only renders after a click on the
  // client, so reading storage here can't cause a hydration mismatch.
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

  const weekStart = sundayOf(selected);
  const weekLogs = useHabitLogs(weekStart, addDays(weekStart, 6));

  const activeList = useMemo(() => active.data ?? [], [active.data]);
  const archivedList = useMemo(() => archived.data ?? [], [archived.data]);
  // Archived habits keep their history on the days before they were archived.
  const allHabits = useMemo(() => [...activeList, ...archivedList], [activeList, archivedList]);
  const archivedIds = useMemo(() => new Set(archivedList.map((h) => h.id)), [archivedList]);
  const logs = weekLogs.data ?? [];
  const entriesFor = (date: string) => dayEntries(allHabits, logs, date, now);

  const entries = entriesFor(selected);
  const { hero, rest } = pickUpNext(entries);

  const shiftWeek = (n: number | 'this') =>
    setSelected((d) => (n === 'this' ? today : addDays(d, 7 * n)));

  return (
    <div className="pb-28">
      <h1 className="page-title mb-6 text-4xl font-bold tracking-tight lg:mb-10">Habits</h1>

      {view === 'active' ? (
        active.isLoading ? (
          <Skeleton />
        ) : active.error ? (
          <LoadError onRetry={() => active.refetch()} />
        ) : !archived.isPending && activeList.length === 0 && archivedList.length === 0 ? (
          <div className="border-border bg-card shadow-glow flex flex-col items-center gap-4 rounded-3xl border px-6 py-12 text-center">
            <p className="text-muted-foreground text-sm">
              No habits yet — add one and we&apos;ll remind you when it&apos;s time.
            </p>
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add habit
            </Button>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <section aria-label="Day">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">{dayTitle(selected)}</h2>
                <button
                  type="button"
                  aria-label="Open calendar"
                  onClick={() => setCalendarOpen(true)}
                  className="text-muted-foreground hover:text-foreground flex h-11 w-11 items-center justify-center rounded-xl"
                >
                  <CalendarDays className="h-5 w-5" />
                </button>
              </div>

              <HabitWeekStrip
                weekStart={weekStart}
                today={today}
                selected={selected}
                onSelect={setSelected}
                onShiftWeek={shiftWeek}
                entriesFor={entriesFor}
              />

              <div className="pt-6">
                {/* Without the week's answers every habit would look unanswered
                    and Skip could overwrite a saved Done — wait for them. */}
                {weekLogs.isPending ? (
                  <Skeleton />
                ) : weekLogs.error ? (
                  <LoadError onRetry={() => weekLogs.refetch()} />
                ) : entries.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Nothing scheduled for this day.
                  </p>
                ) : (
                  <>
                    <h2 className={SECTION_LABEL}>{hero ? 'Up next' : 'All answered'}</h2>
                    {hero ? (
                      <HabitUpNext entry={hero} date={selected} onOpen={setEditing} />
                    ) : (
                      <p className="text-muted-foreground mb-8 text-sm">
                        Every habit for this day has an answer.
                      </p>
                    )}
                    {rest.length > 0 && (
                      <>
                        <h2 className={cn(SECTION_LABEL, 'mb-4')}>
                          {selected === today ? 'Later today' : 'Rest of the day'}
                        </h2>
                        <HabitTimeline entries={rest} date={selected} onOpen={setEditing} />
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            <section aria-label="Habit directory">
              <h2 className={cn(SECTION_LABEL, 'mb-4')}>Habit directory</h2>
              {activeList.length === 0 ? (
                <p className="text-muted-foreground text-sm">No active habits.</p>
              ) : (
                <HabitDirectory habits={activeList} onOpen={setEditing} />
              )}
            </section>
          </div>
        )
      ) : archived.isLoading ? (
        <Skeleton />
      ) : archived.error ? (
        <LoadError onRetry={() => archived.refetch()} />
      ) : archivedList.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">Nothing archived.</p>
      ) : (
        <ArchivedHabitDirectory
          habits={archivedList}
          onRestore={(h) => update.mutate({ id: h.id, archived: false })}
          onDelete={setConfirmDelete}
        />
      )}

      {/* Floating Active/Archive + New bar. Portalled so `fixed` resolves
          against the viewport (see page-tab-bar). Shown once the first fetch
          settles, which only happens on the client — no hydration mismatch. */}
      {!active.isPending &&
        createPortal(
          <div className="page-tab-bar-pb safe-px pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 lg:left-64">
            <div className="border-border bg-card/90 shadow-glow-lg pointer-events-auto mb-2 flex w-full max-w-sm items-center justify-between rounded-full border p-1.5 backdrop-blur-md">
              <div
                className="bg-background/50 border-border/60 flex rounded-full border p-1"
                role="group"
                aria-label="Show"
              >
                {(['active', 'archive'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      'min-h-11 rounded-full px-4 text-xs capitalize transition-colors',
                      view === v
                        ? 'bg-muted text-foreground font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground font-medium'
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="bg-primary text-primary-foreground shadow-glow-sm flex h-11 items-center gap-2 rounded-full pr-4 pl-3 text-sm font-bold transition-transform hover:opacity-90 active:scale-95"
              >
                <span className="bg-primary-foreground/20 rounded-full p-0.5">
                  <Plus className="h-4 w-4" />
                </span>
                New
              </button>
            </div>
          </div>,
          document.body
        )}

      <Sheet open={calendarOpen} onOpenChange={setCalendarOpen}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'overflow-y-auto p-6',
            isMobile
              ? 'safe-pb max-h-[90dvh] rounded-t-3xl'
              : 'w-full rounded-l-3xl pt-12 sm:max-w-lg'
          )}
        >
          <SheetTitle className="sr-only">Calendar</SheetTitle>
          <SheetDescription className="sr-only">Habit history by week or month</SheetDescription>
          {calendarOpen && (
            <HabitCalendar
              mode={mode}
              onModeChange={changeMode}
              habits={allHabits}
              archivedIds={archivedIds}
              now={now}
            />
          )}
        </SheetContent>
      </Sheet>

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
