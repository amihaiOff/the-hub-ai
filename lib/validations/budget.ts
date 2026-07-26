import { z } from 'zod';
import { nonEmptyString, nonNegativeNumber } from './common';

/**
 * Validation schemas for Budget API routes.
 */

// Enums matching Prisma schema
export const transactionTypeSchema = z.enum(['income', 'expense']);
export const transactionSourceSchema = z.enum([
  'manual',
  'bank_import',
  'credit_card_import',
  'moneytor_sync',
]);
export const paymentMethodSchema = z.enum([
  'cash',
  'credit_card',
  'bank_transfer',
  'check',
  'other',
]);

// Hex color validation
const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g., #3B82F6)');

// Date string validation (YYYY-MM-DD)
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');

// Month string validation (YYYY-MM)
const monthStringSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Invalid month format (YYYY-MM)');

// ============================================
// Category Group Schemas
// ============================================

export const createCategoryGroupSchema = z.object({
  name: nonEmptyString('Category group name is required'),
  sortOrder: z.number().int().optional(),
});

export const updateCategoryGroupSchema = z.object({
  name: nonEmptyString('Category group name cannot be empty').optional(),
  sortOrder: z.number().int().optional(),
});

export const reorderGroupsSchema = z.object({
  groups: z.array(
    z.object({
      id: nonEmptyString('Group ID is required'),
      sortOrder: z.number().int(),
    })
  ),
});

// ============================================
// Category Schemas
// ============================================

export const createCategorySchema = z.object({
  name: nonEmptyString('Category name is required'),
  groupId: nonEmptyString('Group ID is required'),
  budget: nonNegativeNumber('Budget must be a non-negative number').nullable().optional(),
  isMust: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = z.object({
  name: nonEmptyString('Category name cannot be empty').optional(),
  groupId: nonEmptyString('Group ID cannot be empty').optional(),
  budget: nonNegativeNumber('Budget must be a non-negative number').nullable().optional(),
  isMust: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const reorderCategoriesSchema = z.object({
  categories: z.array(
    z.object({
      id: nonEmptyString('Category ID is required'),
      sortOrder: z.number().int(),
    })
  ),
});

// ============================================
// Payee Schemas
// ============================================

export const createPayeeSchema = z.object({
  name: nonEmptyString('Payee name is required'),
  categoryId: z.string().nullable().optional(),
});

export const updatePayeeSchema = z.object({
  name: nonEmptyString('Payee name cannot be empty').optional(),
  categoryId: z.string().nullable().optional(),
  recategorizeTransactions: z.boolean().optional(),
  neverDefault: z.boolean().optional(),
  isBlacklisted: z.boolean().optional(),
});

// ============================================
// Tag Schemas
// ============================================

export const createTagSchema = z.object({
  name: nonEmptyString('Tag name is required'),
  color: hexColorSchema.optional().default('#3B82F6'),
});

export const updateTagSchema = z.object({
  name: nonEmptyString('Tag name cannot be empty').optional(),
  color: hexColorSchema.optional(),
});

export const mergeTagsSchema = z.object({
  sourceTagIds: z.array(z.string()).min(1, 'At least one source tag is required'),
  targetTagId: nonEmptyString('Target tag ID is required'),
});

export const mergeCategoriesSchema = z
  .object({
    sourceCategoryId: nonEmptyString('Source category ID is required'),
    targetCategoryId: nonEmptyString('Target category ID is required'),
  })
  .refine((data) => data.sourceCategoryId !== data.targetCategoryId, {
    message: 'Source and target categories must be different',
  });

// ============================================
// Transaction Schemas
// ============================================

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  transactionDate: dateStringSchema,
  paymentDate: dateStringSchema.nullable().optional(),
  amountIls: nonNegativeNumber('Amount must be a non-negative number'),
  currency: z.string().optional().default('ILS'),
  amountOriginal: nonNegativeNumber('Original amount must be a non-negative number').optional(),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  paymentMethod: paymentMethodSchema.optional().default('credit_card'),
  paymentNumber: z.number().int().positive().nullable().optional(),
  totalPayments: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: transactionSourceSchema.optional().default('manual'),
  isRecurring: z.boolean().optional().default(false),
  profileId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional().default([]),
  paymentIdentifier: z.string().max(100).nullable().optional(),
  excludedFromFlow: z.boolean().optional().default(false),
});

export const updateTransactionSchema = z.object({
  type: transactionTypeSchema.optional(),
  transactionDate: dateStringSchema.optional(),
  paymentDate: dateStringSchema.nullable().optional(),
  amountIls: nonNegativeNumber('Amount must be a non-negative number').optional(),
  currency: z.string().optional(),
  amountOriginal: nonNegativeNumber('Original amount must be a non-negative number').optional(),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  paymentNumber: z.number().int().positive().nullable().optional(),
  totalPayments: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: transactionSourceSchema.optional(),
  isRecurring: z.boolean().optional(),
  profileId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  paymentIdentifier: z.string().max(100).nullable().optional(),
  excludedFromFlow: z.boolean().optional(),
});

export const transactionFiltersSchema = z.object({
  month: monthStringSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  type: transactionTypeSchema.optional(),
  categoryId: z.string().optional(),
  payeeId: z.string().optional(),
  profileId: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  source: transactionSourceSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  uncategorized: z.boolean().optional(),
  /**
   * Rows the AI has suggested a category for but the user hasn't accepted or
   * declined yet — i.e. suggested_category_id IS NOT NULL AND category_id IS
   * NULL. Overrides categoryId / uncategorized when set.
   */
  pendingSuggestion: z.boolean().optional(),
  accountNumber: z.string().optional(),
  limit: z.number().int().positive().max(1000).optional().default(100),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const bulkTransactionSchema = z.object({
  transactions: z.array(createTransactionSchema).min(1).max(500),
});

export const bulkCategorizeSchema = z.object({
  transactionIds: z.array(z.string()).min(1, 'At least one transaction ID is required'),
  categoryId: z.string(),
});

export const bulkDeleteSchema = z.object({
  transactionIds: z.array(z.string()).min(1, 'At least one transaction ID is required'),
});

// Split transaction schema
export const createSplitSchema = z.object({
  originalTransactionId: nonEmptyString('Original transaction ID is required'),
  splits: z
    .array(
      z.object({
        amountIls: nonNegativeNumber('Amount must be a non-negative number'),
        categoryId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .min(2, 'At least 2 splits are required'),
});

// ============================================
// Payee Category Rule Schemas
// ============================================

export const ruleOperatorSchema = z.enum(['contains', 'starts_with', 'ends_with', 'equals']);

export const createPayeeCategoryRuleSchema = z
  .object({
    name: nonEmptyString('Rule name is required').max(200),
    operator: ruleOperatorSchema,
    value: nonEmptyString('Match value is required').max(200),
    categoryId: z.string().nullable().optional(),
    markNeverDefault: z.boolean().optional().default(false),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (data) =>
      (data.markNeverDefault === true && !data.categoryId) ||
      (data.markNeverDefault !== true && !!data.categoryId),
    {
      message: 'Provide either a category or set markNeverDefault, not both',
      path: ['categoryId'],
    }
  );

export const updatePayeeCategoryRuleSchema = z
  .object({
    name: nonEmptyString('Rule name cannot be empty').optional(),
    operator: ruleOperatorSchema.optional(),
    value: nonEmptyString('Match value cannot be empty').optional(),
    categoryId: z.string().nullable().optional(),
    markNeverDefault: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    // Disallow setting both at once. The route is responsible for ensuring the
    // resulting record still has exactly one of (categoryId, markNeverDefault).
    (data) => !(data.markNeverDefault === true && !!data.categoryId),
    { message: 'Cannot set both a category and markNeverDefault', path: ['categoryId'] }
  );

// ============================================
// Budget Account Name Schemas
// ============================================

export const createBudgetAccountNameSchema = z.object({
  accountNumber: nonEmptyString('Account number is required').max(100),
  name: nonEmptyString('Name is required').max(200),
});

export const updateBudgetAccountNameSchema = z.object({
  name: nonEmptyString('Name is required').max(200),
});

// ============================================
// Moneytor Schemas
// ============================================

const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

export const forceResyncMoneytorSchema = z
  .object({
    from: z.string().regex(dateOnlyRegex, 'from must be YYYY-MM-DD'),
    to: z.string().regex(dateOnlyRegex, 'to must be YYYY-MM-DD'),
  })
  .refine((d) => d.from <= d.to, {
    message: 'from must be on or before to',
    path: ['from'],
  });

// ============================================
// Import Schemas (Riseup CSV)
// ============================================

export const importTransactionSchema = z.object({
  type: transactionTypeSchema,
  transactionDate: dateStringSchema,
  paymentDate: dateStringSchema.nullable().optional(),
  amountIls: nonNegativeNumber('Amount must be a non-negative number'),
  currency: z.string().optional().default('ILS'),
  amountOriginal: z.number().nullable().optional(),
  payeeName: z.string().min(1, 'Payee name is required'),
  riseupCategory: z.string().nullable().optional(),
  paymentMethod: paymentMethodSchema.optional().default('credit_card'),
  paymentNumber: z.number().int().positive().nullable().optional(),
  totalPayments: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: transactionSourceSchema.optional().default('manual'),
  paymentIdentifier: z.string().max(100).nullable().optional(),
  excludedFromFlow: z.boolean().optional().default(false),
  // Set only when this row originates from a Moneytor sync. Acts as the natural
  // dedup key so re-running sync never creates a duplicate budget_transaction.
  moneytorId: z.string().optional(),
});

export const importBulkSchema = z.object({
  transactions: z.array(importTransactionSchema).min(1).max(5000),
});

// ============================================
// Summary Schema
// ============================================

export const summaryQuerySchema = z.object({
  month: monthStringSchema,
});

// ============================================
// Analysis Schema
// ============================================

export const analysisQuerySchema = z
  .object({
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'endDate must be on or after startDate',
  });

// ============================================
// Type Exports
// ============================================

export type CreateCategoryGroupInput = z.infer<typeof createCategoryGroupSchema>;
export type UpdateCategoryGroupInput = z.infer<typeof updateCategoryGroupSchema>;
export type ReorderGroupsInput = z.infer<typeof reorderGroupsSchema>;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

export type CreatePayeeInput = z.infer<typeof createPayeeSchema>;
export type UpdatePayeeInput = z.infer<typeof updatePayeeSchema>;

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type MergeTagsInput = z.infer<typeof mergeTagsSchema>;
export type MergeCategoriesInput = z.infer<typeof mergeCategoriesSchema>;

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
export type BulkTransactionInput = z.infer<typeof bulkTransactionSchema>;
export type BulkCategorizeInput = z.infer<typeof bulkCategorizeSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type CreateSplitInput = z.infer<typeof createSplitSchema>;

export type CreatePayeeCategoryRuleInput = z.infer<typeof createPayeeCategoryRuleSchema>;
export type UpdatePayeeCategoryRuleInput = z.infer<typeof updatePayeeCategoryRuleSchema>;

export type CreateBudgetAccountNameInput = z.infer<typeof createBudgetAccountNameSchema>;
export type UpdateBudgetAccountNameInput = z.infer<typeof updateBudgetAccountNameSchema>;

export type ImportTransactionInput = z.infer<typeof importTransactionSchema>;
export type ImportBulkInput = z.infer<typeof importBulkSchema>;

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type AnalysisQuery = z.infer<typeof analysisQuerySchema>;
