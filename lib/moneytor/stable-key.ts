/**
 * Compute stable identity keys for synced Moneytor entities.
 *
 * Moneytor reissues its own `productId` on reconnect (see the One-Zero
 * duplicate incident on 2026-07-06). Anywhere the underlying provider
 * gives us a stable resource id — or where we can synthesise one from
 * durable fields — we prefer that over `productId` for matching.
 *
 * Every function returns `null` when its inputs don't yield a usable
 * key; the reconciler then falls back to `productId`.
 */

/** Lowercase + collapse whitespace + trim. Bank strings often have
 * trailing spaces (e.g. "בנק הבינלאומי ") that would defeat exact
 * match otherwise. */
function normalize(s: string | null | undefined): string {
  if (s == null) return '';
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Bank + debt accounts.
 * `openfinanceAssetId` is the provider (bank) resource id — issued by
 * the bank itself via the open-finance layer, not by Moneytor — and is
 * present on every bank row and every credit-card debt in the current
 * dataset. When it's missing (mortgage, share broker), returns null.
 */
export function computeAccountStableKey(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const r = rawData as { openfinanceAssetId?: unknown };
  if (typeof r.openfinanceAssetId === 'string' && r.openfinanceAssetId.trim() !== '') {
    return r.openfinanceAssetId.trim();
  }
  return null;
}

/**
 * Pension funds.
 * `(institution, accountNumber, routeName)` uniquely identifies every
 * fund we've seen. All three are populated on every current pension row.
 */
export function computePensionStableKey(input: {
  institution: string | null | undefined;
  accountNumber: string | null | undefined;
  routeName: string | null | undefined;
}): string | null {
  const inst = normalize(input.institution);
  const acct = normalize(input.accountNumber);
  const route = normalize(input.routeName);
  if (!inst || !acct || !route) return null;
  return `${inst}|${acct}|${route}`;
}

/**
 * Real-estate properties.
 * Full concatenated address is the stable identifier — Moneytor pins
 * this via reverse-geocode on the property, so it doesn't change if the
 * user re-links the connection.
 */
export function computeRealEstateStableKey(address: string | null | undefined): string | null {
  const a = normalize(address);
  return a || null;
}
