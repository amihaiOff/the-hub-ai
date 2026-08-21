import {
  moveAxis,
  shouldEngageDeleteSwipe,
  clampReveal,
  resolveSwipeEnd,
  isStationary,
  SWIPE_REVEAL_PX,
  SWIPE_OPEN_THRESHOLD,
  AXIS_SLOP_PX,
} from '../db-row-gesture';

describe('moveAxis', () => {
  it('is "none" within the slop radius', () => {
    expect(moveAxis(2, 3)).toBe('none');
    expect(moveAxis(-5, 5)).toBe('none');
  });
  it('is still "none" just inside the slop radius on both axes', () => {
    expect(moveAxis(AXIS_SLOP_PX - 1, AXIS_SLOP_PX - 1)).toBe('none');
  });
  it('engages an axis exactly at the slop boundary (strict "<")', () => {
    // dx exactly at slop → no longer "none"; ties break horizontal.
    expect(moveAxis(AXIS_SLOP_PX, 0)).toBe('horizontal');
    expect(moveAxis(0, AXIS_SLOP_PX)).toBe('vertical');
  });
  it('picks the dominant axis past the slop', () => {
    expect(moveAxis(30, 4)).toBe('horizontal');
    expect(moveAxis(4, 30)).toBe('vertical');
    expect(moveAxis(-30, 5)).toBe('horizontal');
  });
  it('breaks ties toward horizontal (equal magnitudes, both signs)', () => {
    expect(moveAxis(20, 20)).toBe('horizontal');
    expect(moveAxis(-20, 20)).toBe('horizontal');
    expect(moveAxis(20, -20)).toBe('horizontal');
  });
});

describe('shouldEngageDeleteSwipe', () => {
  it('engages only for a rightward horizontal drag at the left edge', () => {
    expect(shouldEngageDeleteSwipe(40, 5, true)).toBe(true);
  });
  it('does not engage when not scrolled to the left edge', () => {
    expect(shouldEngageDeleteSwipe(40, 5, false)).toBe(false);
  });
  it('does not engage on a leftward drag', () => {
    expect(shouldEngageDeleteSwipe(-40, 5, true)).toBe(false);
  });
  it('does not engage on a vertical drag', () => {
    expect(shouldEngageDeleteSwipe(10, 40, true)).toBe(false);
  });
  it('does not engage within the slop radius', () => {
    expect(shouldEngageDeleteSwipe(3, 2, true)).toBe(false);
  });
});

describe('clampReveal', () => {
  it('clamps to [0, max]', () => {
    expect(clampReveal(-20)).toBe(0);
    expect(clampReveal(30)).toBe(30);
    expect(clampReveal(999)).toBe(SWIPE_REVEAL_PX);
  });
  it('passes through the exact bounds unchanged', () => {
    expect(clampReveal(0)).toBe(0);
    expect(clampReveal(SWIPE_REVEAL_PX)).toBe(SWIPE_REVEAL_PX);
  });
});

describe('resolveSwipeEnd', () => {
  it('stays open past the threshold, snaps closed below it', () => {
    expect(resolveSwipeEnd(SWIPE_OPEN_THRESHOLD)).toBe(true);
    expect(resolveSwipeEnd(SWIPE_OPEN_THRESHOLD + 20)).toBe(true);
    expect(resolveSwipeEnd(SWIPE_OPEN_THRESHOLD - 1)).toBe(false);
    expect(resolveSwipeEnd(0)).toBe(false);
  });
});

describe('isStationary', () => {
  it('is true only within the slop radius', () => {
    expect(isStationary(2, 2)).toBe(true);
    expect(isStationary(20, 0)).toBe(false);
    expect(isStationary(0, 20)).toBe(false);
  });
});
