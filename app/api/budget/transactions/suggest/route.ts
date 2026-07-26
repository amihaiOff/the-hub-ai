import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import {
  suggestCategoriesForHousehold,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
} from '@/lib/ai/suggest-categories';

export const maxDuration = 60;

const bodySchema = z.object({
  limit: z.number().int().min(1).max(MAX_BATCH_LIMIT).optional(),
  transactionIds: z.array(z.string()).max(MAX_BATCH_LIMIT).optional(),
  /**
   * When true, reset `categorization_attempted_at` on the target rows so the
   * batch re-attempts them. Default is false — repeated Suggest clicks on
   * already-attempted rows used to silently re-bill; this makes force opt-in.
   */
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    const body = await request.json().catch(() => ({}));
    const validation = bodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    // Force-retry: clear the attempted stamp (and error count) on the
    // targeted rows before the batch claims them. Household-scoped so this
    // never touches another user's data.
    if (validation.data.force) {
      const where: {
        householdId: string;
        isDeleted: boolean;
        id?: { in: string[] };
      } = { householdId, isDeleted: false };
      if (validation.data.transactionIds?.length) {
        where.id = { in: validation.data.transactionIds };
      }
      await prisma.budgetTransaction.updateMany({
        where,
        data: { categorizationAttemptedAt: null, categorizationErrorCount: 0 },
      });
    }

    const result = await suggestCategoriesForHousehold(householdId, {
      limit: validation.data.limit ?? DEFAULT_BATCH_LIMIT,
      transactionIds: validation.data.transactionIds,
      // Default to only-unattempted so a repeat click on the Suggest button
      // is a no-op on rows the AI has already tried. Opt into a real re-run
      // via `force: true` above.
      onlyUnattempted: true,
    });

    if (!result.ok) {
      const error =
        result.reason === 'no_api_key'
          ? 'No Anthropic API key configured. Add one in Settings.'
          : 'No budget categories to choose from.';
      return NextResponse.json({ success: false, error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result.counts });
  } catch (error) {
    console.error('Error suggesting categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to suggest categories' },
      { status: 500 }
    );
  }
}
