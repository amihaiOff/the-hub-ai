import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  action: z.enum(['approve', 'dismiss']),
});

/**
 * POST /api/budget/transactions/[id]/suggestion
 * approve → apply the AI-suggested category (categoryId = suggestedCategoryId).
 * dismiss → drop the suggestion, leaving the transaction uncategorized.
 * Either way the suggestion fields are cleared.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = bodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const tx = await prisma.budgetTransaction.findFirst({
      where: { id, householdId },
      select: { id: true, suggestedCategoryId: true },
    });
    if (!tx) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }
    if (!tx.suggestedCategoryId) {
      return NextResponse.json(
        { success: false, error: 'No suggestion to act on' },
        { status: 400 }
      );
    }

    await prisma.budgetTransaction.update({
      where: { id },
      data: {
        categoryId: validation.data.action === 'approve' ? tx.suggestedCategoryId : undefined,
        suggestedCategoryId: null,
        suggestionConfidence: null,
        suggestedAt: null,
      },
    });

    return NextResponse.json({ success: true, data: { id, action: validation.data.action } });
  } catch (error) {
    console.error('Error acting on suggestion:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update suggestion' },
      { status: 500 }
    );
  }
}
