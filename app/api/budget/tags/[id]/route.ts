import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateTagSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/budget/tags/[id]
 * Get a specific tag with transaction count
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    const tag = await prisma.budgetTag.findFirst({
      where: { id, householdId },
      include: {
        _count: {
          select: { transactionTags: true },
        },
      },
    });

    if (!tag) {
      return NextResponse.json({ success: false, error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        transactionCount: tag._count.transactionTags,
        householdId: tag.householdId,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching tag:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tag' }, { status: 500 });
  }
}

/**
 * PUT /api/budget/tags/[id]
 * Update a tag
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify tag belongs to household
    const existingTag = await prisma.budgetTag.findFirst({
      where: { id, householdId },
    });

    if (!existingTag) {
      return NextResponse.json({ success: false, error: 'Tag not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updateTagSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, color } = validation.data;

    const tag = await prisma.budgetTag.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
      },
      include: {
        _count: {
          select: { transactionTags: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        transactionCount: tag._count.transactionTags,
        householdId: tag.householdId,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating tag:', error);

    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'A tag with this name already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: 'Failed to update tag' }, { status: 500 });
  }
}

/**
 * DELETE /api/budget/tags/[id]
 * Delete a tag (removes from all transactions)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const householdId = context.activeHousehold.id;

    // Verify tag belongs to household
    const existingTag = await prisma.budgetTag.findFirst({
      where: { id, householdId },
    });

    if (!existingTag) {
      return NextResponse.json({ success: false, error: 'Tag not found' }, { status: 404 });
    }

    // Delete (cascades to transaction-tag links)
    await prisma.budgetTag.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete tag' }, { status: 500 });
  }
}
