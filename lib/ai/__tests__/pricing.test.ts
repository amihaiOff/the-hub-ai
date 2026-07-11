import { computeCost } from '../pricing';

describe('computeCost', () => {
  it('prices each component at the Haiku 4.5 rate', () => {
    const c = computeCost({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      webSearches: 100,
    });
    expect(c.inputUsd).toBeCloseTo(1.0, 10);
    expect(c.outputUsd).toBeCloseTo(5.0, 10);
    expect(c.cacheWriteUsd).toBeCloseTo(1.25, 10);
    expect(c.cacheReadUsd).toBeCloseTo(0.1, 10);
    expect(c.searchUsd).toBeCloseTo(1.0, 10); // 100 × $0.01
    expect(c.totalUsd).toBeCloseTo(8.35, 10);
  });

  it('is zero for empty usage', () => {
    const c = computeCost({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      webSearches: 0,
    });
    expect(c.totalUsd).toBe(0);
  });

  it('scales sub-million token counts proportionally', () => {
    const c = computeCost({
      inputTokens: 250_000, // 0.25 × $1
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      webSearches: 0,
    });
    expect(c.inputUsd).toBeCloseTo(0.25, 10);
    expect(c.totalUsd).toBeCloseTo(0.25, 10);
  });
});
