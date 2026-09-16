/**
 * A per-page public-share token: 24 random bytes, base64url-encoded (32
 * chars, URL-safe, unguessable). Stored on `Page.shareToken` — its presence
 * is what lets `/share/[token]` serve the page with no session at all.
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}
