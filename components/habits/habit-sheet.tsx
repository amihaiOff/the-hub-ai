'use client';

import { useState } from 'react';
import { Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AppearancePicker } from '@/components/shared/appearance-picker';
import { useIsMobileViewport } from '@/lib/hooks/use-is-mobile-viewport';
import { useCreateHabit, useUpdateHabit, type HabitRow } from '@/lib/hooks/use-habits';
import { createHabitSchema } from '@/lib/validations/habits';
import { getFirstZodError } from '@/lib/validations/common';
import { formatTime, WEEKDAY_LABELS } from '@/lib/habits/schedule';

const TIMES = Array.from({ length: 96 }, (_, i) => i * 15);
const INTERVALS = [
  { value: 1, label: 'Every week' },
  { value: 2, label: 'Every 2 weeks' },
  { value: 3, label: 'Every 3 weeks' },
  { value: 4, label: 'Every 4 weeks' },
];

/** `habit`: null = closed, 'new' = add, a row = edit. */
export function HabitSheet({
  habit,
  onClose,
}: {
  habit: HabitRow | 'new' | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobileViewport();
  return (
    <Sheet open={habit !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'overflow-y-auto p-6',
          isMobile
            ? 'safe-pb max-h-[90dvh] rounded-t-3xl'
            : 'w-full rounded-l-3xl pt-12 sm:max-w-md'
        )}
      >
        {habit !== null && (
          // Keyed so the form state resets when a different habit opens.
          <HabitForm key={habit === 'new' ? 'new' : habit.id} habit={habit} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function HabitForm({ habit, onClose }: { habit: HabitRow | 'new'; onClose: () => void }) {
  const existing = habit === 'new' ? null : habit;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [icon, setIcon] = useState<string | null>(existing?.icon ?? 'Repeat');
  const [color, setColor] = useState<string | null>(existing?.color ?? null);
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? []);
  const [timeMinutes, setTimeMinutes] = useState(existing?.timeMinutes ?? 8 * 60);
  const [intervalWeeks, setIntervalWeeks] = useState(existing?.intervalWeeks ?? 1);
  const [notify, setNotify] = useState(existing?.notify ?? true);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const saving = create.isPending || update.isPending;

  const toggleDay = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  const save = async () => {
    const parsed = createHabitSchema.safeParse({
      title,
      icon,
      color,
      weekdays,
      timeMinutes,
      intervalWeeks,
      notify,
    });
    if (!parsed.success) return setError(getFirstZodError(parsed.error));
    setError(null);
    try {
      if (existing) await update.mutateAsync({ id: existing.id, ...parsed.data });
      else await create.mutateAsync(parsed.data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    }
  };

  const archive = async () => {
    if (!existing) return;
    try {
      await update.mutateAsync({ id: existing.id, archived: true });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive');
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <SheetHeader className="p-0">
        <SheetTitle>{existing ? 'Edit habit' : 'New habit'}</SheetTitle>
        <SheetDescription className="sr-only">Title, schedule and reminder</SheetDescription>
      </SheetHeader>

      <div className="space-y-2">
        <Label htmlFor="habit-title">Title</Label>
        <div className="flex gap-2">
          <AppearancePicker
            icon={icon}
            color={color}
            onIcon={setIcon}
            onColor={setColor}
            label="Icon and colour"
          />
          <Input
            id="habit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Gym"
            maxLength={120}
            autoFocus={!existing}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Days</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={weekdays.includes(i)}
              onClick={() => toggleDay(i)}
              className={cn(
                'h-10 min-w-11 rounded-xl border px-2 text-sm font-medium transition-colors',
                weekdays.includes(i)
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="habit-time">Time</Label>
          <select
            id="habit-time"
            value={timeMinutes}
            onChange={(e) => setTimeMinutes(Number(e.target.value))}
            className="border-input bg-card h-10 w-full rounded-xl border px-3 text-sm tabular-nums"
          >
            {TIMES.map((m) => (
              <option key={m} value={m}>
                {formatTime(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="habit-interval">Repeats</Label>
          <select
            id="habit-interval"
            value={intervalWeeks}
            onChange={(e) => setIntervalWeeks(Number(e.target.value))}
            className="border-input bg-card h-10 w-full rounded-xl border px-3 text-sm"
          >
            {INTERVALS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="habit-notify" className="flex-1">
          Notify me at this time
        </Label>
        <Switch id="habit-notify" checked={notify} onCheckedChange={setNotify} />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-2">
        {existing && (
          <Button type="button" variant="ghost" onClick={archive} disabled={saving}>
            <Archive className="h-4 w-4" /> Archive
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {existing ? 'Save' : 'Add habit'}
        </Button>
      </div>
    </form>
  );
}
