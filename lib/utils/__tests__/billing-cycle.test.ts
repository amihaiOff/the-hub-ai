import { getCurrentCycleMonth, monthToCycleRange } from '../billing-cycle';

describe('monthToCycleRange', () => {
  it('with startDay=1 returns the calendar month [first, next-first)', () => {
    const { from, to } = monthToCycleRange('2026-06', 1);
    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(5);
    expect(from.getDate()).toBe(1);
    expect(to.getFullYear()).toBe(2026);
    expect(to.getMonth()).toBe(6);
    expect(to.getDate()).toBe(1);
  });

  it('with startDay=10 returns [Jun 10, Jul 10) for "2026-06"', () => {
    const { from, to } = monthToCycleRange('2026-06', 10);
    expect(from.getDate()).toBe(10);
    expect(from.getMonth()).toBe(5);
    expect(to.getDate()).toBe(10);
    expect(to.getMonth()).toBe(6);
  });

  it('rolls year forward at December for any startDay', () => {
    const { from, to } = monthToCycleRange('2026-12', 10);
    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(11);
    expect(to.getFullYear()).toBe(2027);
    expect(to.getMonth()).toBe(0);
    expect(to.getDate()).toBe(10);
  });

  it('clamps invalid startDay values into a safe range', () => {
    const ranges = [-3, 0, 30, 99, NaN].map((d) => monthToCycleRange('2026-06', d));
    // Negative/zero/NaN clamp to 1; >28 clamps to 28.
    expect(ranges[0].from.getDate()).toBe(1);
    expect(ranges[1].from.getDate()).toBe(1);
    expect(ranges[2].from.getDate()).toBe(28);
    expect(ranges[3].from.getDate()).toBe(28);
    expect(ranges[4].from.getDate()).toBe(1);
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
