import { z } from 'zod';

/**
 * A route target is a bare pathname — never a full URL and never a query
 * string.
 *
 * Query params are excluded deliberately: budget month is billing-cycle-aware
 * and Analysis defaults to the current month, so a pinned `?month=2026-08`
 * would rot into a link to a stale month rather than acting as a shortcut
 * (see docs/decisions.md). Pinned filters would be a saved-view feature.
 *
 * The trailing-slash transform matters: without it `/budget` and `/budget/`
 * are two distinct rows that render identically in the drawer, so the unique
 * index wouldn't stop what looks to the user like a duplicate.
 */
const routePath = z
  .string()
  .trim()
  .min(1, 'Route is required')
  .max(500)
  .refine((v) => v.startsWith('/'), 'Route must start with /')
  .refine((v) => !v.startsWith('//'), 'Route must not be protocol-relative')
  .refine((v) => !/[?#]/.test(v), 'Route must not include a query string')
  // `/\evil.com` is treated as protocol-relative by WHATWG URL parsing, so a
  // backslash is as dangerous as the `//` above. Control characters are
  // stripped by some parsers, which can smuggle a `javascript:` prefix past a
  // naive check. Neither is reachable today — POST also requires the path to be
  // in the nav allowlist — but this schema shouldn't be the thing standing
  // between a relaxed allowlist and an open redirect.
  .refine((v) => !v.includes('\\'), 'Route must not contain a backslash')
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'Route must not contain control characters')
  .transform((v) => (v.length > 1 ? v.replace(/\/+$/, '') : v));

/**
 * Exactly one target: `pageId` for an Areas page (stored as a real FK so the
 * label stays live and a page deletion cascades the favourite away), or
 * `route` for a nav-registered pathname.
 *
 * This `.refine` is the ONLY thing enforcing the one-of invariant — there is no
 * CHECK constraint, because this schema has none anywhere and a single code
 * path writes these rows. The DB's two unique indexes can't express it: they
 * stop duplicates, not both-set or neither-set rows.
 */
export const createFavoriteSchema = z
  .object({
    pageId: z.string().min(1).optional(),
    route: routePath.optional(),
  })
  .refine((v) => (v.pageId ? 1 : 0) + (v.route ? 1 : 0) === 1, {
    message: 'Provide exactly one of pageId or route',
  });
export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;

/**
 * Bulk reorder. The body key is named after the resource (`favorites`),
 * matching `reorderTaskCategoriesSchema`'s `categories`.
 *
 * There is no update schema: favourites can't be renamed (a custom label would
 * drift from the page title) and ordering is bulk-only.
 */
export const reorderFavoritesSchema = z.object({
  favorites: z
    .array(
      z.object({
        id: z.string().min(1, 'Favorite ID is required'),
        sortOrder: z.number().int(),
      })
    )
    .min(1)
    .max(200),
});
export type ReorderFavoritesInput = z.infer<typeof reorderFavoritesSchema>;
