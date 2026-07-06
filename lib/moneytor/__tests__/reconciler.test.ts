import { reconcile, decideMissingActions, GRACE_PERIOD_MISSES } from '../reconciler';

const NOW = new Date('2026-07-06T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

// Small factory to keep test rows compact.
function existing(overrides: Partial<Parameters<typeof reconcile>[1][number]> = {}) {
  return {
    id: overrides.id ?? 'row-1',
    productId: overrides.productId ?? 'pid-1',
    stableKey: overrides.stableKey ?? null,
    userCanonicalId: overrides.userCanonicalId ?? null,
    name: overrides.name ?? 'Account',
  };
}
function incoming(overrides: Partial<Parameters<typeof reconcile>[0][number]> = {}) {
  return {
    productId: overrides.productId ?? 'pid-1',
    stableKey: overrides.stableKey ?? null,
    name: overrides.name ?? 'Account',
  };
}

describe('reconcile', () => {
  it('matches by userCanonicalId first, even when productId changed', () => {
    const rows = [existing({ id: 'a', productId: 'old', userCanonicalId: 'my-checking' })];
    const inc = [incoming({ productId: 'new', stableKey: 'my-checking' })];
    const out = reconcile(inc, rows, NOW);
    expect(out.matches[0].existing?.id).toBe('a');
  });

  it('matches by stableKey when userCanonicalId is not set', () => {
    const rows = [existing({ id: 'a', productId: 'old', stableKey: 'openfinance-xyz' })];
    const inc = [incoming({ productId: 'brand-new', stableKey: 'openfinance-xyz' })];
    const out = reconcile(inc, rows, NOW);
    expect(out.matches[0].existing?.id).toBe('a');
  });

  it('falls back to productId when stableKey is unavailable', () => {
    const rows = [existing({ id: 'a', productId: 'pid-1' })];
    const inc = [incoming({ productId: 'pid-1', stableKey: null })];
    const out = reconcile(inc, rows, NOW);
    expect(out.matches[0].existing?.id).toBe('a');
  });

  it('emits nothing when the incoming payload is an entirely new row', () => {
    const rows = [existing({ id: 'a', productId: 'pid-1' })];
    const inc = [incoming({ productId: 'pid-2', stableKey: null, name: 'New' })];
    const out = reconcile(inc, rows, NOW);
    expect(out.matches[0].existing).toBeNull();
    expect(out.renameEvents).toHaveLength(0);
  });

  it('flags a rename when the matched row has a different name', () => {
    const rows = [existing({ id: 'a', stableKey: 'sk', name: 'Old' })];
    const inc = [incoming({ stableKey: 'sk', name: 'New' })];
    const out = reconcile(inc, rows, NOW);
    expect(out.renameEvents).toEqual([{ existing: rows[0], oldName: 'Old', newName: 'New' }]);
  });

  it('does not flag a rename when the name is identical', () => {
    const rows = [existing({ id: 'a', stableKey: 'sk', name: 'X' })];
    const inc = [incoming({ stableKey: 'sk', name: 'X' })];
    const out = reconcile(inc, rows, NOW);
    expect(out.renameEvents).toHaveLength(0);
  });
});

describe('decideMissingActions', () => {
  it('marks freshly-missing rows for missingSince', () => {
    const unmatched = [{ ...existing({ id: 'a' }), missingSince: null }];
    const { toMarkMissing, toHardDelete } = decideMissingActions(unmatched, NOW);
    expect(toMarkMissing).toHaveLength(1);
    expect(toHardDelete).toHaveLength(0);
  });

  it('leaves rows within the grace period alone', () => {
    const unmatched = [
      { ...existing({ id: 'a' }), missingSince: new Date(NOW.getTime() - 1 * DAY) },
    ];
    const { toMarkMissing, toHardDelete } = decideMissingActions(unmatched, NOW);
    expect(toMarkMissing).toHaveLength(0);
    expect(toHardDelete).toHaveLength(0);
  });

  it('hard-deletes rows missing past the grace period', () => {
    const unmatched = [
      {
        ...existing({ id: 'a' }),
        missingSince: new Date(NOW.getTime() - (GRACE_PERIOD_MISSES + 1) * DAY),
      },
    ];
    const { toHardDelete } = decideMissingActions(unmatched, NOW);
    expect(toHardDelete).toHaveLength(1);
  });
});
