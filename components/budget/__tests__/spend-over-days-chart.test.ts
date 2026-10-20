/**
 * Unit tests for buildDailySeries (spend-over-days chart data)
 */

// Recharts isn't needed for the pure series builder
jest.mock('recharts', () => ({}));

import { buildDailySeries } from '../spend-over-days-chart';

// Server shape: zero-filled, one entry per cycle day (Oct 10 → Nov 9)
const cycle = Array.from({ length: 31 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 10 + i));
  return { date: d.toISOString().slice(0, 10), amount: i === 0 ? 100 : i === 2 ? 50.5 : 0 };
});

describe('buildDailySeries', () => {
  it('returns an empty series for no data', () => {
    expect(buildDailySeries([], '2026-10-20')).toEqual([]);
  });

  it('current cycle: stops at yesterday, keeps zero days, runs a total', () => {
    const series = buildDailySeries(cycle, '2026-10-13');
    expect(series).toEqual([
      { date: '2026-10-10', label: '10/10', amount: 100, cumulative: 100 },
      { date: '2026-10-11', label: '11/10', amount: 0, cumulative: 100 },
      { date: '2026-10-12', label: '12/10', amount: 50.5, cumulative: 150.5 },
    ]);
  });

  it('cycle start day itself: nothing finished yet', () => {
    expect(buildDailySeries(cycle, '2026-10-10')).toEqual([]);
  });

  it('past cycle: shows every day through the 9th, across the month boundary', () => {
    const series = buildDailySeries(cycle, '2026-12-01');
    expect(series).toHaveLength(31);
    expect(series[0].date).toBe('2026-10-10');
    expect(series[series.length - 1]).toMatchObject({ date: '2026-11-09', label: '9/11' });
    expect(series[series.length - 1].cumulative).toBe(150.5);
  });
});
