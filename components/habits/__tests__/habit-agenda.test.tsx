/**
 * Pure-logic tests for `dayEntries` — the per-day list that feeds the week
 * strip, the "Up next" hero and the timeline on /habits.
 */

import { dayEntries, pickUpNext, type DayEntry } from '../habit-agenda';
import type { HabitLogRow, HabitRow } from '@/lib/hooks/use-habits';

// Created Sunday 2026-11-01. 2026-11-09 is a Monday, 2026-11-10 a Tuesday.
const habit = (id: string, over: Partial<HabitRow> = {}): HabitRow => ({
  id,
  title: id,
  icon: null,
  color: null,
  notify: false,
  weekdays: [1], // Monday
  timeMinutes: 8 * 60,
  intervalWeeks: 1,
  startDate: '2026-11-01',
  sortOrder: 0,
  archivedAt: null,
  ...over,
});

const MON = '2026-11-09';
// 08:30 Israel (UTC+2 in winter) on that Monday.
const NOW = new Date('2026-11-09T06:30:00Z');

describe('dayEntries', () => {
  it('returns scheduled habits sorted by time, earliest first', () => {
    const habits = [
      habit('late', { timeMinutes: 20 * 60 }),
      habit('early', { timeMinutes: 6 * 60 }),
      habit('mid', { timeMinutes: 12 * 60 }),
    ];
    const ids = dayEntries(habits, [], MON, NOW).map((e) => e.habit.id);
    expect(ids).toEqual(['early', 'mid', 'late']);
  });

  it('does not mutate the input habits array', () => {
    const habits = [habit('b', { timeMinutes: 600 }), habit('a', { timeMinutes: 60 })];
    dayEntries(habits, [], MON, NOW);
    expect(habits.map((h) => h.id)).toEqual(['b', 'a']);
  });

  it('excludes habits not scheduled that day', () => {
    const habits = [habit('mon'), habit('tue', { weekdays: [2] })];
    expect(dayEntries(habits, [], MON, NOW).map((e) => e.habit.id)).toEqual(['mon']);
  });

  it('includes logged-but-unscheduled habits (e.g. schedule changed after logging)', () => {
    const habits = [
      habit('tue', { weekdays: [2], timeMinutes: 5 * 60 }),
      habit('mon', { timeMinutes: 7 * 60 }),
    ];
    const logs: HabitLogRow[] = [{ habitId: 'tue', date: MON, status: 'DONE' }];
    const entries = dayEntries(habits, logs, MON, NOW);
    expect(entries.map((e) => e.habit.id)).toEqual(['tue', 'mon']);
    expect(entries[0]).toMatchObject({ status: 'DONE', state: 'done' });
  });

  it('includes archived habits only when they were logged that day', () => {
    const archived = habit('arch', { archivedAt: '2026-11-05T10:00:00Z' });
    expect(dayEntries([archived], [], MON, NOW)).toEqual([]);
    const logs: HabitLogRow[] = [{ habitId: 'arch', date: MON, status: 'NOT_DONE' }];
    expect(dayEntries([archived], logs, MON, NOW)).toEqual([
      { habit: archived, status: 'NOT_DONE', state: 'not_done' },
    ]);
  });

  it('ignores logs for other days', () => {
    const logs: HabitLogRow[] = [{ habitId: 'tue', date: '2026-11-10', status: 'DONE' }];
    expect(dayEntries([habit('tue', { weekdays: [2] })], logs, MON, NOW)).toEqual([]);
    const [entry] = dayEntries([habit('mon')], logs, MON, NOW);
    expect(entry.status).toBeUndefined();
  });

  it('derives states from occurrenceState', () => {
    const habits = [
      habit('done', { timeMinutes: 6 * 60 }),
      habit('notDone', { timeMinutes: 6 * 60 + 1 }),
      habit('due', { timeMinutes: 8 * 60 }), // 08:00 <= 08:30
      habit('upcoming', { timeMinutes: 9 * 60 }), // 09:00 > 08:30
    ];
    const logs: HabitLogRow[] = [
      { habitId: 'done', date: MON, status: 'DONE' },
      { habitId: 'notDone', date: MON, status: 'NOT_DONE' },
    ];
    const states = Object.fromEntries(
      dayEntries(habits, logs, MON, NOW).map((e) => [e.habit.id, [e.status, e.state]])
    );
    expect(states).toEqual({
      done: ['DONE', 'done'],
      notDone: ['NOT_DONE', 'not_done'],
      due: [undefined, 'due'],
      upcoming: [undefined, 'upcoming'],
    });
  });

  it('marks unanswered past days missed and future days upcoming', () => {
    const h = habit('mon', { timeMinutes: 23 * 60 });
    const tuesday = new Date('2026-11-10T08:00:00Z');
    expect(dayEntries([h], [], MON, tuesday)[0].state).toBe('missed');
    const prevSunday = new Date('2026-11-08T08:00:00Z');
    expect(dayEntries([h], [], MON, prevSunday)[0].state).toBe('upcoming');
  });

  it('returns an empty list when nothing is scheduled or logged', () => {
    expect(dayEntries([], [], MON, NOW)).toEqual([]);
  });
});

describe('pickUpNext', () => {
  const e = (id: string, state: DayEntry['state'], status?: DayEntry['status']) =>
    ({ habit: { id } as DayEntry['habit'], state, status }) as DayEntry;

  it('prefers the first unanswered due/missed habit over an earlier upcoming one', () => {
    const entries = [e('a', 'done', 'DONE'), e('b', 'upcoming'), e('c', 'due')];
    const { hero, rest } = pickUpNext(entries);
    expect(hero?.habit.id).toBe('c');
    expect(rest.map((r) => r.habit.id)).toEqual(['a', 'b']);
  });

  it('falls back to the earliest upcoming habit', () => {
    expect(pickUpNext([e('a', 'upcoming'), e('b', 'upcoming')]).hero?.habit.id).toBe('a');
  });

  it('has no hero when every habit is answered', () => {
    const { hero, rest } = pickUpNext([e('a', 'done', 'DONE'), e('b', 'not_done', 'NOT_DONE')]);
    expect(hero).toBeUndefined();
    expect(rest).toHaveLength(2);
  });
});
