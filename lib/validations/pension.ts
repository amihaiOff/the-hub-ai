import { z } from 'zod';
import { nonEmptyString, positiveNumber, nonNegativeNumber, percentage } from './common';

/**
 * Validation schemas for Pension API routes.
 */

// Update pension account schema (all fields optional)
export const updatePensionAccountSchema = z.object({
  providerName: nonEmptyString('Provider name cannot be empty').optional(),
  accountName: nonEmptyString('Account name cannot be empty').optional(),
  currentValue: nonNegativeNumber('Current value must be a non-negative number').optional(),
  feeFromDeposit: percentage('Fee from deposit must be a percentage between 0 and 100').optional(),
  feeFromTotal: percentage('Fee from total must be a percentage between 0 and 100').optional(),
});

// Custom date string that gives proper error messages
const depositDateString = z
  .string({ message: 'Deposit date is required' })
  .transform((val, ctx) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid deposit date format',
      });
      return z.NEVER;
    }
    return date;
  });

const salaryMonthString = z
  .string({ message: 'Salary month is required' })
  .transform((val, ctx) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid salary month format',
      });
      return z.NEVER;
    }
    return date;
  });

// Create pension deposit schema
export const createDepositSchema = z.object({
  accountId: nonEmptyString('Account ID is required'),
  depositDate: depositDateString,
  salaryMonth: salaryMonthString,
  amount: positiveNumber('Amount must be a positive number'),
  employer: nonEmptyString('Employer name is required'),
});

// Update pension deposit schema (all fields optional)
export const updateDepositSchema = z.object({
  depositDate: z
    .string({ message: 'Invalid deposit date format' })
    .transform((val, ctx) => {
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid deposit date format',
        });
        return z.NEVER;
      }
      return date;
    })
    .optional(),
  salaryMonth: z
    .string({ message: 'Invalid salary month format' })
    .transform((val, ctx) => {
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid salary month format',
        });
        return z.NEVER;
      }
      return date;
    })
    .optional(),
  amount: positiveNumber('Amount must be a positive number').optional(),
  employer: nonEmptyString('Employer name cannot be empty').optional(),
});

// Single deposit item for bulk create - permissive schema to allow validateBulkDeposit to provide indexed errors
const bulkDepositItemSchema = z.object({
  depositDate: z.string().optional(),
  salaryMonth: z.string().optional(),
  amount: z.number().optional(),
  employer: z.string().optional(),
});

// Bulk create deposits schema
export const bulkDepositSchema = z.object({
  accountId: nonEmptyString('Account ID is required'),
  deposits: z
    .array(bulkDepositItemSchema, { message: 'At least one deposit is required' })
    .min(1, 'At least one deposit is required')
    .max(100, 'Maximum 100 deposits allowed per request'),
});

// Validation for individual deposit in bulk (with index for error messages)
export function validateBulkDeposit(deposit: z.infer<typeof bulkDepositItemSchema>, index: number) {
  const errors: string[] = [];

  // Validate deposit date
  if (!deposit.depositDate) {
    errors.push(`Deposit ${index + 1}: Deposit date is required`);
  } else {
    const parsedDate = new Date(deposit.depositDate);
    if (isNaN(parsedDate.getTime())) {
      errors.push(`Deposit ${index + 1}: Invalid deposit date format`);
    }
  }

  // Validate salary month
  if (!deposit.salaryMonth) {
    errors.push(`Deposit ${index + 1}: Salary month is required`);
  } else {
    const parsedMonth = new Date(deposit.salaryMonth);
    if (isNaN(parsedMonth.getTime())) {
      errors.push(`Deposit ${index + 1}: Invalid salary month format`);
    }
  }

  // Validate amount
  if (deposit.amount === undefined || typeof deposit.amount !== 'number' || deposit.amount <= 0) {
    errors.push(`Deposit ${index + 1}: Amount must be a positive number`);
  }

  // Validate employer
  if (!deposit.employer || typeof deposit.employer !== 'string' || deposit.employer.trim() === '') {
    errors.push(`Deposit ${index + 1}: Employer name is required`);
  }

  return errors;
}

// Type exports for use in routes
export type UpdatePensionAccountInput = z.infer<typeof updatePensionAccountSchema>;
export type CreateDepositInput = z.infer<typeof createDepositSchema>;
export type UpdateDepositInput = z.infer<typeof updateDepositSchema>;
export type BulkDepositInput = z.infer<typeof bulkDepositSchema>;
