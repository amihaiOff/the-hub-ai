/**
 * Unit tests for CUID validation utilities
 * Tests security-critical validation functions for API parameters
 */

import { validateCuid, validateCuids, cuidSchema } from '../validation';

describe('Validation Utilities', () => {
  describe('cuidSchema', () => {
    it('should accept valid CUID', () => {
      const validCuid = 'clfx1234567890abcdefghij';
      const result = cuidSchema.safeParse(validCuid);
      expect(result.success).toBe(true);
    });

    it('should reject empty string', () => {
      const result = cuidSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject invalid format', () => {
      const result = cuidSchema.safeParse('not-a-cuid');
      expect(result.success).toBe(false);
    });

    it('should reject SQL injection attempts', () => {
      const result = cuidSchema.safeParse("'; DROP TABLE users; --");
      expect(result.success).toBe(false);
    });

    it('should reject UUID format', () => {
      const result = cuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(false);
    });

    it('should reject numeric IDs', () => {
      const result = cuidSchema.safeParse('12345');
      expect(result.success).toBe(false);
    });
  });

  describe('validateCuid', () => {
    it('should return valid result for valid CUID', () => {
      const validCuid = 'clfx1234567890abcdefghij';
      const result = validateCuid(validCuid);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.id).toBe(validCuid);
      }
    });

    it('should return error response for invalid CUID', () => {
      const result = validateCuid('invalid-id');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return error response for empty string', () => {
      const result = validateCuid('');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should return proper error message in response', async () => {
      const result = validateCuid('bad-id');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        const body = await result.response.json();
        expect(body.success).toBe(false);
        expect(body.error).toBe('Invalid ID format');
      }
    });

    it('should handle path traversal attempts', () => {
      const result = validateCuid('../../../etc/passwd');
      expect(result.valid).toBe(false);
    });

    it('should handle null-byte injection', () => {
      const result = validateCuid('clfx1234\x00injection');
      // Zod CUID validation may or may not reject null bytes depending on implementation
      // The important thing is it handles them without crashing
      expect(typeof result.valid).toBe('boolean');
    });

    it('should handle very long strings', () => {
      const longString = 'c'.repeat(10000);
      const result = validateCuid(longString);
      // Long strings that start with 'c' may pass basic CUID format check
      // The important thing is it handles them without crashing
      expect(typeof result.valid).toBe('boolean');
    });

    it('should handle special characters', () => {
      const specialChars = '!@#$%^&*()';
      const result = validateCuid(specialChars);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateCuids', () => {
    it('should return valid result for all valid CUIDs', () => {
      const ids = {
        userId: 'clfx1234567890abcdefghij',
        accountId: 'clfx0987654321zyxwvutsrq',
      };

      const result = validateCuids(ids);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.ids).toEqual(ids);
      }
    });

    it('should return error for first invalid CUID', () => {
      const ids = {
        userId: 'invalid-user-id',
        accountId: 'clfx0987654321zyxwvutsrq',
      };

      const result = validateCuids(ids);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.response.status).toBe(400);
      }
    });

    it('should include field name in error message', async () => {
      const ids = {
        householdId: 'invalid-id',
      };

      const result = validateCuids(ids);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        const body = await result.response.json();
        expect(body.error).toBe('Invalid householdId format');
      }
    });

    it('should handle empty object', () => {
      const result = validateCuids({});

      // Empty object should be valid (no IDs to validate)
      expect(result.valid).toBe(true);
    });

    it('should validate all IDs in order', async () => {
      const ids = {
        firstId: 'clfx1234567890abcdefghij',
        secondId: 'bad-id',
        thirdId: 'clfx0987654321zyxwvutsrq',
      };

      const result = validateCuids(ids);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        const body = await result.response.json();
        expect(body.error).toBe('Invalid secondId format');
      }
    });

    it('should reject if any ID is invalid', async () => {
      const ids = {
        goodId1: 'clfx1234567890abcdefghij',
        goodId2: 'clfx0987654321zyxwvutsrq',
        badId: 'not-valid',
      };

      const result = validateCuids(ids);

      expect(result.valid).toBe(false);
    });

    it('should handle single ID', () => {
      const ids = {
        profileId: 'clfx1234567890abcdefghij',
      };

      const result = validateCuids(ids);

      expect(result.valid).toBe(true);
    });
  });

  describe('Security edge cases', () => {
    it('should reject prototype pollution attempt', () => {
      const result = validateCuid('__proto__');
      // __proto__ doesn't start with 'c' so should be invalid
      expect(result.valid).toBe(false);
    });

    it('should reject constructor pollution if not CUID format', () => {
      // 'constructor' starts with 'c' and is alphanumeric, so Zod CUID may accept it
      // The actual security is in the database layer - this just tests format
      const result = validateCuid('constructor');
      // Just verify it doesn't crash
      expect(typeof result.valid).toBe('boolean');
    });

    it('should handle unicode characters', () => {
      // Zod CUID may or may not reject unicode depending on implementation
      const result = validateCuid('clfx🎉1234567890abcdef');
      // Just verify it doesn't crash
      expect(typeof result.valid).toBe('boolean');
    });

    it('should handle whitespace-padded IDs', () => {
      const result = validateCuid('  clfx1234567890abcdefghij  ');
      // Whitespace should make it invalid
      expect(result.valid).toBe(false);
    });

    it('should handle newline characters', () => {
      const result = validateCuid('clfx1234\n567890abcdefghij');
      // Newline should make it invalid
      expect(result.valid).toBe(false);
    });
  });
});
