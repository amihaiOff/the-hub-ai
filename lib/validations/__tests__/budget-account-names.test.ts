/**
 * Unit tests for the budget account-name validation schemas.
 */

import { createBudgetAccountNameSchema, updateBudgetAccountNameSchema } from '../budget';

describe('createBudgetAccountNameSchema', () => {
  it('accepts a valid account number and name', () => {
    const result = createBudgetAccountNameSchema.safeParse({
      accountNumber: '111122223333',
      name: 'Joint Checking',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty account number', () => {
    const result = createBudgetAccountNameSchema.safeParse({
      accountNumber: '',
      name: 'Joint Checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = createBudgetAccountNameSchema.safeParse({
      accountNumber: '111122223333',
      name: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a name longer than 200 characters', () => {
    const result = createBudgetAccountNameSchema.safeParse({
      accountNumber: '111122223333',
      name: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateBudgetAccountNameSchema', () => {
  it('accepts a valid name', () => {
    const result = updateBudgetAccountNameSchema.safeParse({ name: 'Renamed' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = updateBudgetAccountNameSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});
