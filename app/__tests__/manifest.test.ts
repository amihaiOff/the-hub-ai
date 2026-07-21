/**
 * Unit tests for the PWA web app manifest (app/manifest.ts)
 * Verifies key manifest fields and icon configuration required for
 * installability and correct standalone display.
 */

import manifest from '../manifest';

describe('PWA manifest', () => {
  const result = manifest();

  describe('core fields', () => {
    it('should expose the app name and short name', () => {
      expect(result.name).toBe('The Hub - Financial Management');
      expect(result.short_name).toBe('The Hub');
    });

    it('should be installable as a standalone app rooted at "/"', () => {
      expect(result.display).toBe('standalone');
      expect(result.start_url).toBe('/');
      expect(result.scope).toBe('/');
    });

    it('should use the dark theme and background colors', () => {
      expect(result.theme_color).toBe('#0d0e10');
      expect(result.background_color).toBe('#0d0e10');
    });
  });

  describe('icons', () => {
    it('should define exactly four icons', () => {
      expect(Array.isArray(result.icons)).toBe(true);
      expect(result.icons).toHaveLength(4);
    });

    it('should provide "any" purpose icons at 192 and 512', () => {
      const anyIcons = result.icons!.filter((icon) => icon.purpose === 'any');
      expect(anyIcons).toHaveLength(2);
      expect(anyIcons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
      anyIcons.forEach((icon) => {
        expect(icon.type).toBe('image/png');
        expect(icon.src).toMatch(/^\/icons\/.+\.png$/);
      });
    });

    it('should provide "maskable" purpose icons at 192 and 512', () => {
      const maskableIcons = result.icons!.filter((icon) => icon.purpose === 'maskable');
      expect(maskableIcons).toHaveLength(2);
      expect(maskableIcons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
      maskableIcons.forEach((icon) => {
        expect(icon.type).toBe('image/png');
        expect(icon.src).toMatch(/^\/icons\/.+\.png$/);
      });
    });

    it('should reference the expected icon asset paths', () => {
      const srcs = result.icons!.map((icon) => icon.src);
      expect(srcs).toEqual(
        expect.arrayContaining([
          '/icons/icon-192.png',
          '/icons/icon-512.png',
          '/icons/icon-maskable-192.png',
          '/icons/icon-maskable-512.png',
        ])
      );
    });
  });
});
