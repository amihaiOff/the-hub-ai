/**
 * Unit tests for the favourites validation schemas.
 *
 * The `.refine` on `createFavoriteSchema` is the ONLY enforcement of the
 * one-of-two-targets invariant (no CHECK constraint exists), so both the
 * both-set and neither-set cases are asserted on the refine's own message
 * rather than on a field error. The route rules are equally load-bearing:
 * they're what makes a stored route known-good by construction, which is what
 * the drawer's greyed-out "Removed" state depends on.
 */

import { createFavoriteSchema, reorderFavoritesSchema } from '../favorites';

const REFINE_MESSAGE = 'Provide exactly one of pageId or route';

/** First issue message, mirroring what the routes surface via getFirstZodError. */
function firstError(result: { success: false; error: { issues: { message: string }[] } }) {
  return result.error.issues[0]?.message;
}

describe('createFavoriteSchema', () => {
  describe('exactly-one-target invariant', () => {
    it('accepts a page target alone', () => {
      const result = createFavoriteSchema.safeParse({ pageId: 'p1' });
      expect(result.success).toBe(true);
      expect(result.success && result.data).toEqual({ pageId: 'p1' });
    });

    it('accepts a route target alone', () => {
      const result = createFavoriteSchema.safeParse({ route: '/budget' });
      expect(result.success).toBe(true);
      expect(result.success && result.data).toEqual({ route: '/budget' });
    });

    it('rejects both targets set, with the refine message (not a field error)', () => {
      const result = createFavoriteSchema.safeParse({ pageId: 'p1', route: '/budget' });
      expect(result.success).toBe(false);
      expect(!result.success && firstError(result)).toBe(REFINE_MESSAGE);
    });

    it('rejects neither target set, with the refine message (not a field error)', () => {
      const result = createFavoriteSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(!result.success && firstError(result)).toBe(REFINE_MESSAGE);
    });
  });

  describe('route shape', () => {
    it('rejects a route missing its leading slash', () => {
      const result = createFavoriteSchema.safeParse({ route: 'budget' });
      expect(result.success).toBe(false);
      expect(!result.success && firstError(result)).toBe('Route must start with /');
    });

    it.each(['/budget?month=2026-08', '/budget#section'])('rejects %s', (route) => {
      const result = createFavoriteSchema.safeParse({ route });
      expect(result.success).toBe(false);
      expect(!result.success && firstError(result)).toBe('Route must not include a query string');
    });

    it('rejects a protocol-relative route', () => {
      const result = createFavoriteSchema.safeParse({ route: '//evil.com' });
      expect(result.success).toBe(false);
      expect(!result.success && firstError(result)).toBe('Route must not be protocol-relative');
    });

    it('rejects an empty route', () => {
      const result = createFavoriteSchema.safeParse({ route: '' });
      expect(result.success).toBe(false);
    });

    it('rejects a route over 500 characters', () => {
      const result = createFavoriteSchema.safeParse({ route: '/' + 'a'.repeat(500) });
      expect(result.success).toBe(false);
    });

    it('accepts a route of exactly 500 characters', () => {
      const result = createFavoriteSchema.safeParse({ route: '/' + 'a'.repeat(499) });
      expect(result.success).toBe(true);
    });

    it('normalises a trailing slash so /budget/ cannot duplicate /budget', () => {
      const result = createFavoriteSchema.safeParse({ route: '/budget/' });
      expect(result.success && result.data.route).toBe('/budget');
    });

    it('preserves the bare root route', () => {
      const result = createFavoriteSchema.safeParse({ route: '/' });
      expect(result.success && result.data.route).toBe('/');
    });

    it('trims surrounding whitespace', () => {
      const result = createFavoriteSchema.safeParse({ route: '  /tasks  ' });
      expect(result.success && result.data.route).toBe('/tasks');
    });
  });
});

describe('reorderFavoritesSchema', () => {
  it('accepts a well-formed list', () => {
    const result = reorderFavoritesSchema.safeParse({
      favorites: [
        { id: 'f1', sortOrder: 0 },
        { id: 'f2', sortOrder: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty array (min 1)', () => {
    const result = reorderFavoritesSchema.safeParse({ favorites: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 200 entries (max 200)', () => {
    const favorites = Array.from({ length: 201 }, (_, i) => ({ id: `f${i}`, sortOrder: i }));
    expect(reorderFavoritesSchema.safeParse({ favorites }).success).toBe(false);
  });

  it('accepts exactly 200 entries', () => {
    const favorites = Array.from({ length: 200 }, (_, i) => ({ id: `f${i}`, sortOrder: i }));
    expect(reorderFavoritesSchema.safeParse({ favorites }).success).toBe(true);
  });

  it('rejects a non-integer sortOrder', () => {
    const result = reorderFavoritesSchema.safeParse({
      favorites: [{ id: 'f1', sortOrder: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty favourite id', () => {
    const result = reorderFavoritesSchema.safeParse({ favorites: [{ id: '', sortOrder: 0 }] });
    expect(result.success).toBe(false);
    expect(!result.success && firstError(result)).toBe('Favorite ID is required');
  });
});
