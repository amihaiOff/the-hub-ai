import { generateShareToken } from '../share-token';

describe('generateShareToken', () => {
  it('returns a URL-safe, sufficiently long token', () => {
    const token = generateShareToken();
    // 24 random bytes, base64url-encoded — no padding, no unsafe chars.
    expect(token).toMatch(/^[A-Za-z0-9_-]{30,34}$/);
  });

  it('is not deterministic — two calls differ', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
  });

  it('generates unique tokens across many calls (no collisions in a reasonable sample)', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
    expect(tokens.size).toBe(1000);
  });
});
