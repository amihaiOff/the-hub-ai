import { z } from 'zod';
import { nonEmptyString, positiveNumber, VALID_CURRENCIES } from './common';

/**
 * Validation schemas for Portfolio API routes.
 */

// Create stock account schema
// Currency defaults to USD if not provided or invalid
export const createAccountSchema = z.object({
  name: nonEmptyString('Account name is required'),
  broker: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (val) => val === undefined || val === null || val.length > 0,
      'Broker name cannot be empty or whitespace only'
    ),
  currency: z
    .string()
    .optional()
    .transform((val) => {
      // Default to USD if not provided or invalid
      if (!val || !VALID_CURRENCIES.includes(val as (typeof VALID_CURRENCIES)[number])) {
        return 'USD' as const;
      }
      return val as (typeof VALID_CURRENCIES)[number];
    }),
});

// Update stock account schema (all fields optional)
export const updateAccountSchema = z.object({
  name: nonEmptyString('Account name cannot be empty').optional(),
  broker: z.string().trim().nullable().optional(),
  currency: z
    .string()
    .optional()
    .refine(
      (val) =>
        val === undefined || VALID_CURRENCIES.includes(val as (typeof VALID_CURRENCIES)[number]),
      'Invalid currency'
    ),
});

// Create stock holding schema
export const createHoldingSchema = z.object({
  accountId: nonEmptyString('Account ID is required'),
  symbol: nonEmptyString('Stock symbol is required'),
  name: z.string().trim().optional().nullable(), // Full stock name
  taseSymbol: z.string().trim().optional().nullable(), // TASE equivalent symbol for dual-listed stocks
  quantity: positiveNumber('Quantity must be a positive number'),
  avgCostBasis: positiveNumber('Average cost basis must be a positive number'),
});

// Update stock holding schema (all fields optional)
export const updateHoldingSchema = z.object({
  quantity: positiveNumber('Quantity must be a positive number').optional(),
  avgCostBasis: positiveNumber('Average cost basis must be a positive number').optional(),
  name: z.string().trim().optional().nullable(), // Full stock name
  taseSymbol: z.string().trim().optional().nullable(), // TASE equivalent symbol
});

// Type exports for use in routes
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateHoldingInput = z.infer<typeof createHoldingSchema>;
export type UpdateHoldingInput = z.infer<typeof updateHoldingSchema>;
