import { z } from 'zod';

/**
 * Common validation schemas and helpers for API routes.
 * These can be composed with domain-specific schemas.
 */

// Non-empty string (trims whitespace)
export const nonEmptyString = (message = 'This field is required') =>
  z.string({ message }).trim().min(1, { message });

// Positive number (handles type errors with custom message)
export const positiveNumber = (message = 'Must be a positive number') =>
  z.number({ message }).positive({ message });

// Non-negative number (handles type errors with custom message)
export const nonNegativeNumber = (message = 'Must be a non-negative number') =>
  z.number({ message }).nonnegative({ message });

// Non-zero number (allows positive or negative, but not zero)
export const nonZeroNumber = (message = 'Must be a non-zero number') =>
  z.number({ message }).refine((val) => val !== 0, { message });

// Percentage (0-100) with custom error messages
export const percentage = (message = 'Must be a percentage between 0 and 100') =>
  z.number({ message }).min(0, { message }).max(100, { message });

// Date string that transforms to Date
export const dateString = (message = 'Invalid date format') =>
  z.string().transform((val, ctx) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
      });
      return z.NEVER;
    }
    return date;
  });

// Optional date string that transforms to Date
export const optionalDateString = (message = 'Invalid date format') =>
  z
    .string()
    .optional()
    .transform((val, ctx) => {
      if (val === undefined) return undefined;
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
        });
        return z.NEVER;
      }
      return date;
    });

// Currency codes
export const currencyCode = z.enum(['USD', 'ILS', 'EUR', 'GBP']);

// Valid currencies with default
export const VALID_CURRENCIES = ['USD', 'ILS', 'EUR', 'GBP'] as const;

/**
 * Helper to parse Zod validation result and return first error message.
 * Useful for consistent error responses.
 * Returns just the message without the field path to maintain backward compatibility.
 */
export function getFirstZodError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (firstIssue) {
    return firstIssue.message;
  }
  return 'Validation error';
}
