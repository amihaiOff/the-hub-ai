import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createTagSchema, mergeTagsSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/budget/tags
 * Get all tags for the current household with transaction counts
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const tags = await prisma.budgetTag.findMany({
      where: { householdId },
      include: {
        _count: {
          select: { transactionTags: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Transform to match frontend interface
    const transformedTags = tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      transactionCount: tag._count.transactionTags,
      householdId: tag.householdId,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: transformedTags,
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch tags' }, { status: 500 });
  }
}

/**
 * POST /api/budget/tags
 * Create a new tag
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createTagSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, color } = validation.data;

    const tag = await prisma.budgetTag.create({
      data: {
        name,
        color,
        householdId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        transactionCount: 0,
        householdId: tag.householdId,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error creating tag:', error);

    if (
      error instanceof Error &&
      error.message.includes('Unique constraint failed on the constraint')
    ) {
      return NextResponse.json(
        { success: false, error: 'A tag with this name already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: 'Failed to create tag' }, { status: 500 });
  }
}

/**
 * PUT /api/budget/tags/merge
 * Merge multiple tags into one (move all transactions to target, delete sources)
 */
export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = mergeTagsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { sourceTagIds, targetTagId } = validation.data;

    // Verify all tags belong to household
    const allTagIds = [...sourceTagIds, targetTagId];
    const tags = await prisma.budgetTag.findMany({
      where: {
        id: { in: allTagIds },
        householdId,
      },
    });

    if (tags.length !== allTagIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more tags not found' },
        { status: 404 }
      );
    }

    // Get all transaction-tag links for source tags
    const sourceLinks = await prisma.budgetTransactionTag.findMany({
      where: {
        tagId: { in: sourceTagIds },
      },
    });

    // Get transactions that already have the target tag
    const existingTargetLinks = await prisma.budgetTransactionTag.findMany({
      where: {
        tagId: targetTagId,
      },
      select: { transactionId: true },
    });

    const existingTargetTransactionIds = new Set(existingTargetLinks.map((l) => l.transactionId));

    // Create new links to target tag for transactions that don't already have it
    const newLinksToCreate = sourceLinks
      .filter((link) => !existingTargetTransactionIds.has(link.transactionId))
      .map((link) => link.transactionId);

    // Use transaction to ensure atomicity of merge operation
    await prisma.$transaction(async (tx) => {
      // Create new links one by one (Neon compatibility)
      for (const transactionId of [...new Set(newLinksToCreate)]) {
        try {
          await tx.budgetTransactionTag.create({
            data: {
              transactionId,
              tagId: targetTagId,
            },
          });
        } catch {
          // Ignore duplicates
        }
      }

      // Delete source tags (cascade deletes their links)
      await tx.budgetTag.deleteMany({
        where: {
          id: { in: sourceTagIds },
        },
      });
    });

    // Fetch updated target tag
    const updatedTag = await prisma.budgetTag.findUnique({
      where: { id: targetTagId },
      include: {
        _count: {
          select: { transactionTags: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedTag!.id,
        name: updatedTag!.name,
        color: updatedTag!.color,
        transactionCount: updatedTag!._count.transactionTags,
        householdId: updatedTag!.householdId,
        mergedCount: sourceTagIds.length,
      },
    });
  } catch (error) {
    console.error('Error merging tags:', error);
    return NextResponse.json({ success: false, error: 'Failed to merge tags' }, { status: 500 });
  }
}
