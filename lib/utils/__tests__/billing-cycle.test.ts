import { getCurrentCycleMonth, monthToCycleRange } from '../billing-cycle';

describe('monthToCycleRange', () => {
  it('with startDay=1 returns the calendar month [first, next-first)', () => {
    const { from, to } = monthToCycleRange('2026-06', 1);
    expect(from.getUTCFullYear()).toBe(2026);
    expect(from.getUTCMonth()).toBe(5);
    expect(from.getUTCDate()).toBe(1);
    expect(to.getUTCFullYear()).toBe(2026);
    expect(to.getUTCMonth()).toBe(6);
    expect(to.getUTCDate()).toBe(1);
  });

  it('with startDay=10 returns [Jun 10, Jul 10) for "2026-06"', () => {
    const { from, to } = monthToCycleRange('2026-06', 10);
    expect(from.getUTCDate()).toBe(10);
    expect(from.getUTCMonth()).toBe(5);
    expect(to.getUTCDate()).toBe(10);
    expect(to.getUTCMonth()).toBe(6);
  });

  it('rolls year forward at December for any startDay', () => {
    const { from, to } = monthToCycleRange('2026-12', 10);
    expect(from.getUTCFullYear()).toBe(2026);
    expect(from.getUTCMonth()).toBe(11);
    expect(to.getUTCFullYear()).toBe(2027);
    expect(to.getUTCMonth()).toBe(0);
    expect(to.getUTCDate()).toBe(10);
  });

  it('clamps invalid startDay values into a safe range', () => {
    const ranges = [-3, 0, 30, 99, NaN].map((d) => monthToCycleRange('2026-06', d));
    // Negative/zero/NaN clamp to 1; >28 clamps to 28.
    expect(ranges[0].from.getUTCDate()).toBe(1);
    expect(ranges[1].from.getUTCDate()).toBe(1);
    expect(ranges[2].from.getUTCDate()).toBe(28);
    expect(ranges[3].from.getUTCDate()).toBe(28);
    expect(ranges[4].from.getUTCDate()).toBe(1);
  });

  it('builds bounds as UTC midnight so @db.Date binding does not drift', () => {
    // Regression: with local-time construction in Asia/Jerusalem, the bound
    // for startDay=10 was 2026-06-09T21:00Z, which Prisma sends to Postgres
    // as "2026-06-09" and incorrectly includes Jun 9 in the June cycle.
    const { from, to } = monthToCycleRange('2026-06', 10);
    expect(from.toISOString()).toBe('2026-06-10T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });

  it('throws on a clearly malformed month string', () => {
    expect(() => monthToCycleRange('2026-13', 1)).toThrow(/Invalid month/);
    expect(() => monthToCycleRange('not-a-month', 1)).toThrow(/Invalid month/);
  });
});

describe('getCurrentCycleMonth', () => {
  it('with startDay=1 returns the calendar month', () => {
    expect(getCurrentCycleMonth(new Date(2026, 5, 1), 1)).toBe('2026-06');
    expect(getCurrentCycleMonth(new Date(2026, 5, 30), 1)).toBe('2026-06');
  });

  it('with startDay=10 returns the previous month when today is before the 10th', () => {
    // 2026-06-05 falls inside the May 10 → June 10 cycle, which we label "2026-05".
    expect(getCurrentCycleMonth(new Date(2026, 5, 5), 10)).toBe('2026-05');
  });

  it('with startDay=10 returns the current month when today is on or after the 10th', () => {
    expect(getCurrentCycleMonth(new Date(2026, 5, 10), 10)).toBe('2026-06');
    expect(getCurrentCycleMonth(new Date(2026, 5, 15), 10)).toBe('2026-06');
  });

  it('rolls year back when today is in January before the start day', () => {
    expect(getCurrentCycleMonth(new Date(2026, 0, 5), 10)).toBe('2025-12');
  });
});
