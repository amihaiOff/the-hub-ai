import { z } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Zod schema for validating CUID IDs
 */
export const cuidSchema = z.string().cuid();

/**
 * Validate a CUID ID from URL params
 * @param id - The ID to validate
 * @returns Object with either valid ID or error response
 */
export function validateCuid(
  id: string
): { valid: true; id: string } | { valid: false; response: NextResponse } {
  const result = cuidSchema.safeParse(id);

  if (!result.success) {
    return {
      valid: false,
      response: NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 }),
    };
  }

  return { valid: true, id: result.data };
}

/**
 * Validate multiple CUID IDs from URL params
 * @param ids - Object with ID names and values
 * @returns Object with either valid IDs or error response
 */
export function validateCuids<T extends Record<string, string>>(
  ids: T
): { valid: true; ids: T } | { valid: false; response: NextResponse } {
  for (const [key, value] of Object.entries(ids)) {
    const result = cuidSchema.safeParse(value);
    if (!result.success) {
      return {
        valid: false,
        response: NextResponse.json(
          { success: false, error: `Invalid ${key} format` },
          { status: 400 }
        ),
      };
    }
  }

  return { valid: true, ids };
}
