import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * Shared error → HTTP response mapper for API routes.
 *
 * Historically every route ended with the same shape:
 *   catch (error) {
 *     console.error('Error doing X:', error);
 *     return NextResponse.json({ success: false, error: 'Failed to do X' }, { status: 500 });
 *   }
 * That coerces Zod validation errors, Prisma unique-violations, and
 * genuine 500s to the same opaque 500 — which is both wrong (a P2002
 * should be a 409) and unhelpful to clients (they can't tell what
 * went wrong).
 *
 * `apiErrorResponse(error, context?)` inspects the error and returns
 * a NextResponse with the right status + message:
 *
 *   - ZodError                    → 400 with the first message
 *   - Prisma P2002 (unique)       → 409 "Already exists"
 *   - Prisma P2025 (not found)    → 404 "Not found"
 *   - Prisma P2003 (FK violation) → 400 "Related record missing"
 *   - Anything else               → 500 with the provided fallback
 *
 * `context` is a short human string for the log line (e.g. "creating
 * transaction") — the caller doesn't have to include it, but the
 * ~10ms it costs to type saves hours of guessing when reading logs.
 *
 * Callers use it like:
 *   catch (error) {
 *     return apiErrorResponse(error, 'creating pension account');
 *   }
 * ...and the previous `console.error(...); return 500` boilerplate
 * disappears.
 */
export function apiErrorResponse(error: unknown, context = 'processing request'): NextResponse {
  // Zod validation — surface the FIRST issue as the message. Clients
  // that want full detail can inspect `details`.
  if (error instanceof ZodError) {
    return NextResponse.json(
      { success: false, error: getFirstZodError(error), details: error.format() },
      { status: 400 }
    );
  }

  // Prisma-specific: map the well-known codes to their HTTP shapes.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Already exists' }, { status: 409 });
    }
    if (error.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (error.code === 'P2003') {
      return NextResponse.json(
        { success: false, error: 'Related record missing' },
        { status: 400 }
      );
    }
    // Fall through for other Prisma codes.
  }

  // Duck-typed fallback for callers that catch `error as { code: string }`
  // without an `instanceof` narrowing (there are a couple in the codebase).
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Already exists' }, { status: 409 });
    }
    if (code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
  }

  // Genuine 500. Log with the context so grepping logs for the phrase
  // finds the right route.
  console.error(`Error ${context}:`, error);
  return NextResponse.json({ success: false, error: `Failed while ${context}` }, { status: 500 });
}
