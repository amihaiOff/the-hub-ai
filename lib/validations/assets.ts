import { z } from 'zod';
import { nonEmptyString } from './common';

/**
 * Validation schemas for Assets API routes.
 */

// Valid asset types
export const VALID_ASSET_TYPES = ['bank_deposit', 'loan', 'mortgage', 'child_savings'] as const;

// Max name length
const MAX_NAME_LENGTH = 255;

// Mortgage track schema for validation
export const mortgageTrackSchema = z.object({
  id: z.string().optional(), // undefined for new tracks
  name: nonEmptyString('Track name is required').refine(
    (val) => val.length <= MAX_NAME_LENGTH,
    `Track name must be at most ${MAX_NAME_LENGTH} characters`
  ),
  amount: z
    .number({ message: 'Track amount must be a number' })
    .positive({ message: 'Track amount must be positive' }),
  interestRate: z
    .number({ message: 'Track interest rate must be a number' })
    .min(0, { message: 'Track interest rate must be between 0 and 100' })
    .max(100, { message: 'Track interest rate must be between 0 and 100' }),
  monthlyPayment: z
    .number({ message: 'Track monthly payment must be a number' })
    .positive({ message: 'Track monthly payment must be positive' })
    .optional()
    .nullable(),
  maturityDate: z
    .union([z.string(), z.null()])
    .optional()
    .transform((val, ctx) => {
      if (val === null || val === undefined) return null;
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid track maturity date format',
        });
        return z.NEVER;
      }
      return date;
    }),
  sortOrder: z.number().optional(),
});

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
    // Mortgage tracks (only for mortgage type)
    tracks: z.array(mortgageTrackSchema).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // Validate monthly payment is required for loans (but not mortgages with tracks)
    const isLoan = data.type === 'loan';
    const isMortgage = data.type === 'mortgage';
    const hasTracks = data.tracks && data.tracks.length > 0;

    if (isLoan) {
      if (
        data.monthlyPayment === undefined ||
        data.monthlyPayment === null ||
        data.monthlyPayment <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Monthly payment is required for loans',
          path: ['monthlyPayment'],
        });
      }
    }

    // For mortgages: if no tracks, require monthly payment; if tracks, derive from tracks
    if (isMortgage && !hasTracks) {
      if (
        data.monthlyPayment === undefined ||
        data.monthlyPayment === null ||
        data.monthlyPayment <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Monthly payment is required for mortgages without tracks',
          path: ['monthlyPayment'],
        });
      }
    }

    // Tracks can only be added to mortgages
    if (hasTracks && !isMortgage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tracks can only be added to mortgages',
        path: ['tracks'],
      });
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
  // Mortgage tracks (only for mortgage type) - full array replacement
  tracks: z.array(mortgageTrackSchema).optional().nullable(),
});

// Type exports for use in routes
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
