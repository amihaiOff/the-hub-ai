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
 * approve → apply the AI-suggested category (categoryId = suggestedCategoryId)
 *           and make it this payee's default category (unless the payee is
 *           flagged neverDefault or blacklisted), so future transactions from
 *           the same payee are auto-categorized during ingestion.
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
      select: {
        id: true,
        suggestedCategoryId: true,
        payee: { select: { id: true, categoryId: true, neverDefault: true, isBlacklisted: true } },
      },
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

    const approve = validation.data.action === 'approve';
    const approvedCategoryId = tx.suggestedCategoryId;

    await prisma.budgetTransaction.update({
      where: { id },
      data: {
        categoryId: approve ? approvedCategoryId : undefined,
        suggestedCategoryId: null,
        suggestionConfidence: null,
        suggestedAt: null,
      },
    });

    // On approval, make the approved category this payee's default so future
    // transactions from the same payee are auto-categorized during ingestion.
    // Skip payees the user has flagged neverDefault or blacklisted, and skip a
    // no-op write when the default is already correct.
    let payeeDefaultUpdated = false;
    if (
      approve &&
      tx.payee &&
      !tx.payee.neverDefault &&
      !tx.payee.isBlacklisted &&
      tx.payee.categoryId !== approvedCategoryId
    ) {
      try {
        await prisma.budgetPayee.update({
          where: { id: tx.payee.id },
          data: { categoryId: approvedCategoryId },
        });
        payeeDefaultUpdated = true;
      } catch (err) {
        // The transaction is already categorized; a failed default update is
        // non-fatal — log and move on rather than failing the approval.
        console.warn('Failed to set payee default category on approve:', err);
      }
    }

    return NextResponse.json({
      success: true,
      data: { id, action: validation.data.action, payeeDefaultUpdated },
    });
  } catch (error) {
    console.error('Error acting on suggestion:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update suggestion' },
      { status: 500 }
    );
  }
}
