import { z } from 'zod';
import {
  nonEmptyString,
  positiveNumber,
  nonNegativeNumber,
  nonZeroNumber,
  percentage,
  dateString,
  optionalDateString,
  currencyCode,
  VALID_CURRENCIES,
  getFirstZodError,
} from '../common';

describe('nonEmptyString', () => {
  it('accepts non-empty strings and trims them', () => {
    const schema = nonEmptyString();
    expect(schema.parse('  hi  ')).toBe('hi');
  });
  it('rejects the empty string and whitespace-only', () => {
    const schema = nonEmptyString();
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('   ').success).toBe(false);
  });
  it('surfaces the custom message', () => {
    const schema = nonEmptyString('name required');
    const result = schema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('name required');
  });
});

describe('positiveNumber', () => {
  it('accepts positive numbers', () => {
    expect(positiveNumber().parse(1)).toBe(1);
  });
  it('rejects zero and negatives', () => {
    expect(positiveNumber().safeParse(0).success).toBe(false);
    expect(positiveNumber().safeParse(-1).success).toBe(false);
  });
  it('rejects non-number types with the custom message', () => {
    const result = positiveNumber('need a number').safeParse('nope');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('need a number');
  });
});

describe('nonNegativeNumber', () => {
  it('accepts zero and positives', () => {
    expect(nonNegativeNumber().parse(0)).toBe(0);
    expect(nonNegativeNumber().parse(42)).toBe(42);
  });
  it('rejects negatives', () => {
    expect(nonNegativeNumber().safeParse(-0.1).success).toBe(false);
  });
});

describe('nonZeroNumber', () => {
  it('accepts positives and negatives', () => {
    expect(nonZeroNumber().parse(1)).toBe(1);
    expect(nonZeroNumber().parse(-1)).toBe(-1);
  });
  it('rejects zero', () => {
    const result = nonZeroNumber().safeParse(0);
    expect(result.success).toBe(false);
  });
});

describe('percentage', () => {
  it('accepts values in [0, 100]', () => {
    expect(percentage().parse(0)).toBe(0);
    expect(percentage().parse(50)).toBe(50);
    expect(percentage().parse(100)).toBe(100);
  });
  it('rejects values outside the range', () => {
    expect(percentage().safeParse(-1).success).toBe(false);
    expect(percentage().safeParse(101).success).toBe(false);
  });
});

describe('dateString', () => {
  it('parses ISO strings into Date instances', () => {
    const d = dateString().parse('2026-07-08');
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString().startsWith('2026-07-08')).toBe(true);
  });
  it('rejects invalid date strings with the custom message', () => {
    const result = dateString('bad date').safeParse('not-a-date');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('bad date');
  });
});

describe('optionalDateString', () => {
  it('returns undefined when nothing is supplied', () => {
    const schema = z.object({ d: optionalDateString() });
    const parsed = schema.parse({});
    expect(parsed.d).toBeUndefined();
  });
  it('parses a valid string', () => {
    const parsed = optionalDateString().parse('2026-07-08');
    expect(parsed).toBeInstanceOf(Date);
  });
  it('rejects invalid strings', () => {
    const result = optionalDateString().safeParse('bogus');
    expect(result.success).toBe(false);
  });
});

describe('currencyCode + VALID_CURRENCIES', () => {
  it.each(VALID_CURRENCIES)('accepts %s', (code) => {
    expect(currencyCode.parse(code)).toBe(code);
  });
  it('rejects unknown codes', () => {
    expect(currencyCode.safeParse('JPY').success).toBe(false);
  });
});

describe('getFirstZodError', () => {
  it('returns the first issue message', () => {
    const result = z.object({ name: z.string().min(1, 'name needed') }).safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(getFirstZodError(result.error)).toBe('name needed');
  });
  it('falls back to a generic message when there are no issues', () => {
    // ZodError with an empty issues array is unusual but the helper handles it.
    // We synthesise one so the fallback branch is covered.
    const err = new z.ZodError([]);
    expect(getFirstZodError(err)).toBe('Validation error');
  });
});
