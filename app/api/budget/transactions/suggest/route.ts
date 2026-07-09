import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { getFirstZodError } from '@/lib/validations/common';
import {
  suggestCategoriesForHousehold,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
} from '@/lib/ai/suggest-categories';

// Web search per transaction can take a few seconds; allow a generous ceiling.
export const maxDuration = 60;

const bodySchema = z.object({
  limit: z.number().int().min(1).max(MAX_BATCH_LIMIT).optional(),
  transactionIds: z.array(z.string()).max(MAX_BATCH_LIMIT).optional(),
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

    // The manual button re-runs on demand, so it does NOT filter on
    // categorizationAttemptedAt — the user can re-ask for no-match rows.
    const result = await suggestCategoriesForHousehold(householdId, {
      limit: validation.data.limit ?? DEFAULT_BATCH_LIMIT,
      transactionIds: validation.data.transactionIds,
      onlyUnattempted: false,
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
