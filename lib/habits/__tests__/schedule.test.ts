import {
  canMark,
  formatSchedule,
  formatTime,
  isOccurrence,
  israelClock,
  israelDay,
  nextOccurrence,
  occurrencesInRange,
  occurrenceState,
  type HabitSchedule,
} from '../schedule';

// Created Wednesday 2026-11-04; Mondays + Thursdays at 08:00, every 2 weeks.
const habit: HabitSchedule = {
  weekdays: [1, 4],
  timeMinutes: 8 * 60,
  intervalWeeks: 2,
  startDate: '2026-11-04',
  archivedAt: null,
};
// 08:00 Israel in winter (UTC+2) is 06:00Z.
const at = (iso: string) => new Date(iso);

describe('isOccurrence', () => {
  it('counts weeks from the creation week and skips days before creation', () => {
    expect(isOccurrence(habit, '2026-11-02')).toBe(false); // Mon before creation
    expect(isOccurrence(habit, '2026-11-05')).toBe(true); // Thu, week 0
    expect(isOccurrence(habit, '2026-11-09')).toBe(false); // Mon, week 1
    expect(isOccurrence(habit, '2026-11-16')).toBe(true); // Mon, week 2
    expect(isOccurrence(habit, '2026-11-17')).toBe(false); // Tue
  });

  it('stops from the day the habit was archived', () => {
    const archived = { ...habit, archivedAt: '2026-11-16T10:00:00Z' };
    expect(isOccurrence(archived, '2026-11-05')).toBe(true);
    expect(isOccurrence(archived, '2026-11-16')).toBe(false);
  });

  it('stays aligned across the March DST change', () => {
    const weekly = { ...habit, intervalWeeks: 3, startDate: '2027-03-01' };
    expect(isOccurrence(weekly, '2027-03-22')).toBe(true);
    expect(isOccurrence(weekly, '2027-04-12')).toBe(true);
    expect(isOccurrence(weekly, '2027-04-05')).toBe(false);
  });
});

describe('canMark / occurrenceState', () => {
  it('opens at the habit time, not before', () => {
    expect(canMark(habit, '2026-11-05', at('2026-11-05T05:59:00Z'))).toBe(false);
    expect(canMark(habit, '2026-11-05', at('2026-11-05T06:00:00Z'))).toBe(true);
    expect(occurrenceState(habit, '2026-11-05', undefined, at('2026-11-05T05:00:00Z'))).toBe(
      'upcoming'
    );
    expect(occurrenceState(habit, '2026-11-05', undefined, at('2026-11-05T07:00:00Z'))).toBe('due');
  });

  it('becomes missed after midnight and can still be marked', () => {
    const nextDay = at('2026-11-05T22:30:00Z'); // 00:30 on the 6th in Israel
    expect(occurrenceState(habit, '2026-11-05', undefined, nextDay)).toBe('missed');
    expect(canMark(habit, '2026-11-05', nextDay)).toBe(true);
    expect(occurrenceState(habit, '2026-11-05', 'DONE', nextDay)).toBe('done');
  });

  it('never opens a day that is not scheduled', () => {
    expect(canMark(habit, '2026-11-09', at('2026-11-20T00:00:00Z'))).toBe(false);
  });
});

describe('nextOccurrence / formatSchedule', () => {
  it('skips today once its time has passed', () => {
    expect(nextOccurrence(habit, at('2026-11-05T05:00:00Z'))).toBe('2026-11-05');
    expect(nextOccurrence(habit, at('2026-11-05T07:00:00Z'))).toBe('2026-11-16');
  });

  it('is null for archived habits', () => {
    expect(
      nextOccurrence({ ...habit, archivedAt: '2026-11-05T00:00:00Z' }, at('2026-11-06T00:00:00Z'))
    ).toBeNull();
  });

  it('formats a weekly all-days schedule as every day', () => {
    expect(formatSchedule({ ...habit, intervalWeeks: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe(
      'Every day 08:00'
    );
  });

  it('formats the schedule', () => {
    expect(formatSchedule(habit)).toBe('Every 2 weeks · Mon, Thu 08:00');
    expect(formatSchedule({ ...habit, intervalWeeks: 1, timeMinutes: 1425 })).toBe(
      'Every week · Mon, Thu 23:45'
    );
  });
});

describe('israelClock / israelDay', () => {
  it('uses UTC+2 in winter and UTC+3 in summer', () => {
    expect(israelClock(at('2026-11-05T06:15:00Z'))).toEqual({
      today: '2026-11-05',
      weekday: 4,
      minutes: 8 * 60 + 15,
    });
    expect(israelClock(at('2026-07-02T05:45:00Z'))).toEqual({
      today: '2026-07-02',
      weekday: 4,
      minutes: 8 * 60 + 45,
    });
  });

  it('rolls over to the next Israel day before UTC midnight', () => {
    expect(israelClock(at('2026-11-04T22:05:00Z'))).toEqual({
      today: '2026-11-05',
      weekday: 4,
      minutes: 5,
    });
    expect(israelDay('2026-11-04T22:05:00Z')).toBe('2026-11-05');
    expect(israelDay(at('2026-11-04T21:59:00Z'))).toBe('2026-11-04');
  });
});

describe('occurrencesInRange', () => {
  it('lists only scheduled days within the range, inclusive', () => {
    expect(occurrencesInRange(habit, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-05',
      '2026-11-16',
      '2026-11-19',
      '2026-11-30',
    ]);
  });

  it('is empty for an empty or inverted range', () => {
    expect(occurrencesInRange(habit, '2026-11-06', '2026-11-08')).toEqual([]);
    expect(occurrencesInRange(habit, '2026-11-30', '2026-11-01')).toEqual([]);
  });

  it('weekly habits recur every week, including the creation day itself', () => {
    const weekly = { ...habit, intervalWeeks: 1, weekdays: [3] };
    expect(occurrencesInRange(weekly, '2026-11-01', '2026-11-21')).toEqual([
      '2026-11-04',
      '2026-11-11',
      '2026-11-18',
    ]);
  });

  it('counts the creation week as week 0 even when created on Saturday', () => {
    // Created Sat 2026-11-07 → week 0 is Sun 1st – Sat 7th; Sundays every 2 weeks
    // start in week 2 (the 15th), not on the 8th.
    const sat = { ...habit, startDate: '2026-11-07', weekdays: [0, 6] };
    expect(occurrencesInRange(sat, '2026-11-01', '2026-11-22')).toEqual([
      '2026-11-07',
      '2026-11-15',
      '2026-11-21',
    ]);
  });
});

describe('formatTime', () => {
  it('pads hours and minutes', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(9 * 60 + 5)).toBe('09:05');
  });
});
