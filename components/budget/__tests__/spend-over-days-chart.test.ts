/**
 * Unit tests for buildDailySeries (spend-over-days chart data)
 */

// Recharts isn't needed for the pure series builder
jest.mock('recharts', () => ({}));

import { buildDailySeries } from '../spend-over-days-chart';

describe('buildDailySeries', () => {
  it('returns an empty series for no spend', () => {
    expect(buildDailySeries([])).toEqual([]);
  });

  it('gap-fills missing days with 0 and keeps a running total', () => {
    expect(
      buildDailySeries([
        { date: '2026-10-01', amount: 100 },
        { date: '2026-10-04', amount: 50.5 },
      ])
    ).toEqual([
      { date: '2026-10-01', label: '1/10', amount: 100, cumulative: 100 },
      { date: '2026-10-02', label: '2/10', amount: 0, cumulative: 100 },
      { date: '2026-10-03', label: '3/10', amount: 0, cumulative: 100 },
      { date: '2026-10-04', label: '4/10', amount: 50.5, cumulative: 150.5 },
    ]);
  });

  it('handles a single day', () => {
    expect(buildDailySeries([{ date: '2026-10-20', amount: 42 }])).toEqual([
      { date: '2026-10-20', label: '20/10', amount: 42, cumulative: 42 },
    ]);
  });

  it('crosses a month boundary (Oct 30 → Nov 2)', () => {
    const series = buildDailySeries([
      { date: '2026-10-30', amount: 10 },
      { date: '2026-11-02', amount: 20 },
    ]);
    expect(series.map((p) => p.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(series.map((p) => p.label)).toEqual(['30/10', '31/10', '1/11', '2/11']);
    expect(series.map((p) => p.cumulative)).toEqual([10, 10, 10, 30]);
  });

  it('final cumulative equals the sum of daily amounts', () => {
    const input = [
      { date: '2026-03-25', amount: 12.34 },
      { date: '2026-03-28', amount: 0.66 },
      { date: '2026-03-31', amount: 1000 },
    ];
    const series = buildDailySeries(input);
    expect(series).toHaveLength(7); // spans the late-March DST change without skipping a day
    expect(series[series.length - 1].cumulative).toBeCloseTo(1013, 10);
  });
});
