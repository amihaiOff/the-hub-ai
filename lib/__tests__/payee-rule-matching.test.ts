import { matchesPayeeRule, findMatchingRule } from '@/lib/utils/budget';

describe('matchesPayeeRule', () => {
  describe('contains operator', () => {
    it('should match when payee name contains value', () => {
      expect(matchesPayeeRule('Spotify Premium', 'contains', 'spotify')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(matchesPayeeRule('SPOTIFY PREMIUM', 'contains', 'spotify')).toBe(true);
      expect(matchesPayeeRule('spotify premium', 'contains', 'SPOTIFY')).toBe(true);
    });

    it('should not match when value is absent', () => {
      expect(matchesPayeeRule('Netflix', 'contains', 'spotify')).toBe(false);
    });

    it('should match partial words', () => {
      expect(matchesPayeeRule('Shufersal Deal', 'contains', 'shufer')).toBe(true);
    });
  });

  describe('starts_with operator', () => {
    it('should match when payee name starts with value', () => {
      expect(matchesPayeeRule('Shufersal Deal', 'starts_with', 'shufersal')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(matchesPayeeRule('SHUFERSAL DEAL', 'starts_with', 'shufersal')).toBe(true);
    });

    it('should not match when value is in the middle', () => {
      expect(matchesPayeeRule('Super Shufersal', 'starts_with', 'shufersal')).toBe(false);
    });
  });

  describe('ends_with operator', () => {
    it('should match when payee name ends with value', () => {
      expect(matchesPayeeRule('Super Pharm', 'ends_with', 'pharm')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(matchesPayeeRule('Super PHARM', 'ends_with', 'pharm')).toBe(true);
    });

    it('should not match when value is at the start', () => {
      expect(matchesPayeeRule('Pharm Super', 'ends_with', 'pharm')).toBe(false);
    });
  });

  describe('equals operator', () => {
    it('should match exact payee name', () => {
      expect(matchesPayeeRule('Netflix', 'equals', 'netflix')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(matchesPayeeRule('NETFLIX', 'equals', 'netflix')).toBe(true);
    });

    it('should not match partial names', () => {
      expect(matchesPayeeRule('Netflix Premium', 'equals', 'netflix')).toBe(false);
    });
  });

  it('should return false for unknown operator', () => {
    expect(matchesPayeeRule('test', 'unknown_op' as never, 'test')).toBe(false);
  });
});

describe('findMatchingRule', () => {
  const rules = [
    { operator: 'contains', value: 'shufersal', categoryId: 'cat-groceries', isActive: true },
    { operator: 'equals', value: 'netflix', categoryId: 'cat-entertainment', isActive: true },
    { operator: 'starts_with', value: 'wolt', categoryId: 'cat-dining', isActive: true },
    { operator: 'contains', value: 'market', categoryId: 'cat-groceries-2', isActive: false },
  ];

  it('should return first matching rule', () => {
    const result = findMatchingRule(rules, 'Shufersal Deal');
    expect(result).toEqual({ categoryId: 'cat-groceries' });
  });

  it('should match equals rule', () => {
    const result = findMatchingRule(rules, 'Netflix');
    expect(result).toEqual({ categoryId: 'cat-entertainment' });
  });

  it('should match starts_with rule', () => {
    const result = findMatchingRule(rules, 'Wolt - Order #123');
    expect(result).toEqual({ categoryId: 'cat-dining' });
  });

  it('should skip inactive rules', () => {
    const result = findMatchingRule(rules, 'Super Market');
    expect(result).toBeNull();
  });

  it('should return null when no rules match', () => {
    const result = findMatchingRule(rules, 'Unknown Payee');
    expect(result).toBeNull();
  });

  it('should return null for empty rules array', () => {
    const result = findMatchingRule([], 'Netflix');
    expect(result).toBeNull();
  });

  it('should respect sort order (first match wins)', () => {
    const orderedRules = [
      { operator: 'contains', value: 'shop', categoryId: 'cat-1', isActive: true },
      { operator: 'contains', value: 'shop', categoryId: 'cat-2', isActive: true },
    ];
    const result = findMatchingRule(orderedRules, 'The Shop');
    expect(result).toEqual({ categoryId: 'cat-1' });
  });
});
