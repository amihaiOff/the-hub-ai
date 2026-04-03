import { z } from 'zod';
import { nonEmptyString } from './common';

/**
 * Validation schemas for Shopping List API routes.
 */

// ============================================
// Category Schemas
// ============================================

export const createShoppingCategorySchema = z.object({
  name: nonEmptyString('Category name is required'),
});

// ============================================
// Item Schemas
// ============================================

export const createShoppingItemSchema = z.object({
  name: nonEmptyString('Item name is required'),
  categoryId: nonEmptyString('Category is required'),
  nameHe: z.string().trim().optional(),
  isDefault: z.boolean().optional(),
  warningDays: z.number().int().min(1, 'Warning days must be at least 1').optional(),
});

export const updateShoppingItemSchema = z.object({
  name: nonEmptyString('Item name is required').optional(),
  nameHe: z.string().trim().nullable().optional(),
  categoryId: nonEmptyString('Category is required').optional(),
  isDefault: z.boolean().optional(),
  warningDays: z.number().int().min(1, 'Warning days must be at least 1').nullable().optional(),
});

// ============================================
// Delivery Schemas
// ============================================

export const deliverCartSchema = z.object({
  missingItemIds: z.array(z.string()).optional(),
});

// ============================================
// Cart Schemas
// ============================================

export const addToCartSchema = z.object({
  itemId: nonEmptyString('Item is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').optional().default(1),
});

export const updateCartItemSchema = z
  .object({
    checked: z.boolean().optional(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').optional(),
  })
  .refine((data) => data.checked !== undefined || data.quantity !== undefined, {
    message: 'At least one of checked or quantity must be provided',
  });

// ============================================
// Type Exports
// ============================================

export type CreateShoppingCategoryInput = z.infer<typeof createShoppingCategorySchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
export type DeliverCartInput = z.infer<typeof deliverCartSchema>;
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
