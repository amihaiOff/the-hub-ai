/**
 * Covers the refine branches on the payee-category-rule schemas — both
 * the create-side "one of category or neverDefault" xor and the update
 * schema's "not both at once" check.
 */

import { createPayeeCategoryRuleSchema, updatePayeeCategoryRuleSchema } from '../budget';

describe('createPayeeCategoryRuleSchema', () => {
  const base = {
    name: 'Coffee shops',
    operator: 'contains' as const,
    value: 'coffee',
  };

  it('accepts a rule that sets a categoryId (no markNeverDefault)', () => {
    const result = createPayeeCategoryRuleSchema.safeParse({
      ...base,
      categoryId: 'cat-1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a markNeverDefault rule with no category', () => {
    const result = createPayeeCategoryRuleSchema.safeParse({
      ...base,
      markNeverDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a rule with neither category nor markNeverDefault', () => {
    const result = createPayeeCategoryRuleSchema.safeParse({ ...base });
    expect(result.success).toBe(false);
  });

  it('rejects a rule with both a category and markNeverDefault=true', () => {
    const result = createPayeeCategoryRuleSchema.safeParse({
      ...base,
      categoryId: 'cat-1',
      markNeverDefault: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('updatePayeeCategoryRuleSchema', () => {
  it('accepts a partial patch (only sortOrder)', () => {
    const result = updatePayeeCategoryRuleSchema.safeParse({ sortOrder: 3 });
    expect(result.success).toBe(true);
  });

  it('accepts clearing the category via null', () => {
    const result = updatePayeeCategoryRuleSchema.safeParse({ categoryId: null });
    expect(result.success).toBe(true);
  });

  it('rejects setting both markNeverDefault and a category', () => {
    const result = updatePayeeCategoryRuleSchema.safeParse({
      markNeverDefault: true,
      categoryId: 'cat-1',
    });
    expect(result.success).toBe(false);
  });

  it('accepts markNeverDefault=false alongside a category', () => {
    const result = updatePayeeCategoryRuleSchema.safeParse({
      markNeverDefault: false,
      categoryId: 'cat-1',
    });
    expect(result.success).toBe(true);
  });
});
