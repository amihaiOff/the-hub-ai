import { z } from 'zod';
import { nonEmptyString } from './common';

/**
 * Validation schemas for Assets API routes.
 */

// Valid asset types
export const VALID_ASSET_TYPES = ['bank_deposit', 'loan', 'mortgage', 'child_savings'] as const;

// Max name length
const MAX_NAME_LENGTH = 255;

// Maturity date validation that returns proper error for invalid formats
const maturityDateSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val, ctx) => {
    if (!val) return null;
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid maturity date format',
      });
      return z.NEVER;
    }
    return date;
  });

// Create asset schema
export const createAssetSchema = z
  .object({
    type: z.enum(VALID_ASSET_TYPES, {
      message: 'Type must be one of: bank_deposit, loan, mortgage, child_savings',
    }),
    name: nonEmptyString('Name is required').refine(
      (val) => val.length <= MAX_NAME_LENGTH,
      `Name must be at most ${MAX_NAME_LENGTH} characters`
    ),
    currentValue: z.number({ message: 'Current value must be a number' }),
    interestRate: z
      .number({ message: 'Interest rate must be a percentage between 0 and 100' })
      .min(0, { message: 'Interest rate must be a percentage between 0 and 100' })
      .max(100, { message: 'Interest rate must be a percentage between 0 and 100' }),
    monthlyPayment: z
      .number({ message: 'Monthly payment is required for loans and mortgages' })
      .positive({ message: 'Monthly payment is required for loans and mortgages' })
      .optional()
      .nullable(),
    monthlyDeposit: z
      .number({ message: 'Monthly deposit must be a non-negative number' })
      .nonnegative({ message: 'Monthly deposit must be a non-negative number' })
      .optional()
      .nullable(),
    maturityDate: maturityDateSchema,
  })
  .superRefine((data, ctx) => {
    // Validate monthly payment is required for liabilities
    const isLiability = data.type === 'loan' || data.type === 'mortgage';
    if (isLiability) {
      if (
        data.monthlyPayment === undefined ||
        data.monthlyPayment === null ||
        data.monthlyPayment <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Monthly payment is required for loans and mortgages',
          path: ['monthlyPayment'],
        });
      }
    }
  });

// Update asset schema (all fields optional)
export const updateAssetSchema = z.object({
  name: nonEmptyString('Name cannot be empty')
    .refine(
      (val) => val.length <= MAX_NAME_LENGTH,
      `Name must be at most ${MAX_NAME_LENGTH} characters`
    )
    .optional(),
  currentValue: z.number({ message: 'Current value must be a number' }).optional(),
  interestRate: z
    .number({ message: 'Interest rate must be a percentage between 0 and 100' })
    .min(0, { message: 'Interest rate must be a percentage between 0 and 100' })
    .max(100, { message: 'Interest rate must be a percentage between 0 and 100' })
    .optional(),
  monthlyPayment: z
    .number({ message: 'Monthly payment must be a non-negative number' })
    .nonnegative({ message: 'Monthly payment must be a non-negative number' })
    .optional()
    .nullable(),
  monthlyDeposit: z
    .number({ message: 'Monthly deposit must be a non-negative number' })
    .nonnegative({ message: 'Monthly deposit must be a non-negative number' })
    .optional()
    .nullable(),
  maturityDate: z
    .union([z.string(), z.null()])
    .optional()
    .transform((val, ctx) => {
      if (val === null) return null;
      if (val === undefined) return undefined;
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid maturity date format',
        });
        return z.NEVER;
      }
      return date;
    }),
});

// Type exports for use in routes
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
