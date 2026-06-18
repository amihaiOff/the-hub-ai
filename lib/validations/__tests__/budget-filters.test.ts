/**
 * Unit tests for transactionFiltersSchema in budget validations.
 * Focuses on the uncategorized filter and its interaction with other fields.
 */

import { transactionFiltersSchema } from '../budget';

describe('transactionFiltersSchema', () => {
  describe('uncategorized field', () => {
    it('should accept uncategorized as true', () => {
      const result = transactionFiltersSchema.safeParse({ uncategorized: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBe(true);
      }
    });

    it('should accept uncategorized as false', () => {
      const result = transactionFiltersSchema.safeParse({ uncategorized: false });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBe(false);
      }
    });

    it('should accept omitted uncategorized (optional)', () => {
      const result = transactionFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBeUndefined();
      }
    });

    it('should reject non-boolean uncategorized value', () => {
      const result = transactionFiltersSchema.safeParse({ uncategorized: 'true' });
      expect(result.success).toBe(false);
    });

    it('should reject numeric uncategorized value', () => {
      const result = transactionFiltersSchema.safeParse({ uncategorized: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('uncategorized combined with other filters', () => {
    it('should accept uncategorized with month filter', () => {
      const result = transactionFiltersSchema.safeParse({
        uncategorized: true,
        month: '2024-06',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBe(true);
        expect(result.data.month).toBe('2024-06');
      }
    });

    it('should accept uncategorized with type filter', () => {
      const result = transactionFiltersSchema.safeParse({
        uncategorized: true,
        type: 'expense',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBe(true);
        expect(result.data.type).toBe('expense');
      }
    });

    it('should accept uncategorized with categoryId (validation allows both, API resolves priority)', () => {
      const result = transactionFiltersSchema.safeParse({
        uncategorized: true,
        categoryId: 'cat-1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBe(true);
        expect(result.data.categoryId).toBe('cat-1');
      }
    });

    it('should accept uncategorized with tagIds (validation allows both, API resolves priority)', () => {
      const result = transactionFiltersSchema.safeParse({
        uncategorized: true,
        tagIds: ['tag-1', 'tag-2'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBe(true);
        expect(result.data.tagIds).toEqual(['tag-1', 'tag-2']);
      }
    });

    it('should accept uncategorized with pagination', () => {
      const result = transactionFiltersSchema.safeParse({
        uncategorized: true,
        limit: 50,
        offset: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.uncategorized).toBe(true);
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(10);
      }
    });
  });

  describe('defaults applied correctly', () => {
    it('should apply default limit and offset when not provided', () => {
      const result = transactionFiltersSchema.safeParse({ uncategorized: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
        expect(result.data.offset).toBe(0);
      }
    });
  });

  describe('accountNumber field', () => {
    it('should accept a valid account number string', () => {
      const result = transactionFiltersSchema.safeParse({ accountNumber: '1234567890' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accountNumber).toBe('1234567890');
      }
    });

    it('should accept omitted accountNumber (optional)', () => {
      const result = transactionFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accountNumber).toBeUndefined();
      }
    });

    it('should accept accountNumber combined with month filter', () => {
      const result = transactionFiltersSchema.safeParse({
        accountNumber: '****-1234',
        month: '2024-06',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accountNumber).toBe('****-1234');
        expect(result.data.month).toBe('2024-06');
      }
    });

    it('should accept accountNumber combined with type filter', () => {
      const result = transactionFiltersSchema.safeParse({
        accountNumber: '****-5678',
        type: 'expense',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accountNumber).toBe('****-5678');
        expect(result.data.type).toBe('expense');
      }
    });

    it('should accept accountNumber combined with uncategorized filter', () => {
      const result = transactionFiltersSchema.safeParse({
        accountNumber: '9999',
        uncategorized: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accountNumber).toBe('9999');
        expect(result.data.uncategorized).toBe(true);
      }
    });

    it('should accept an empty string accountNumber', () => {
      // z.string() allows empty strings; the API layer handles no-op filtering
      const result = transactionFiltersSchema.safeParse({ accountNumber: '' });
      expect(result.success).toBe(true);
    });
  });
});
