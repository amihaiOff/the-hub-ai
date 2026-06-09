import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updatePayeeCategoryRuleSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * PUT /api/budget/payee-rules/[id]
 * Update a payee category rule
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { id } = await params;

    // Verify rule belongs to household
    const existingRule = await prisma.payeeCategoryRule.findFirst({
      where: { id, householdId },
    });

    if (!existingRule) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = updatePayeeCategoryRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Determine the post-update mode (markNeverDefault wins; otherwise infer from
    // categoryId if it was provided; otherwise leave existing values alone).
    const willMarkNeverDefault =
      data.markNeverDefault !== undefined ? data.markNeverDefault : existingRule.markNeverDefault;
    const willCategoryId =
      data.markNeverDefault === true
        ? null
        : data.categoryId !== undefined
          ? data.categoryId
          : existingRule.categoryId;

    if (willMarkNeverDefault && willCategoryId) {
      return NextResponse.json(
        { success: false, error: 'A rule cannot have both a category and markNeverDefault' },
        { status: 400 }
      );
    }
    if (!willMarkNeverDefault && !willCategoryId) {
      return NextResponse.json(
        { success: false, error: 'A rule must have either a category or markNeverDefault' },
        { status: 400 }
      );
    }

    // If a category will be set, verify it belongs to household
    if (willCategoryId) {
      const category = await prisma.budgetCategory.findFirst({
        where: { id: willCategoryId, householdId },
      });
      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    const updatedRule = await prisma.payeeCategoryRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.operator !== undefined && { operator: data.operator }),
        ...(data.value !== undefined && { value: data.value }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        categoryId: willCategoryId,
        markNeverDefault: willMarkNeverDefault,
      },
      include: {
        category: { select: { name: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedRule.id,
        name: updatedRule.name,
        operator: updatedRule.operator,
        value: updatedRule.value,
        categoryId: updatedRule.categoryId,
        categoryName: updatedRule.category?.name ?? null,
        markNeverDefault: updatedRule.markNeverDefault,
        sortOrder: updatedRule.sortOrder,
        isActive: updatedRule.isActive,
        householdId: updatedRule.householdId,
        createdAt: updatedRule.createdAt,
        updatedAt: updatedRule.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating payee category rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update payee category rule' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/budget/payee-rules/[id]
 * Delete a payee category rule
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const { id } = await params;

    // Verify rule belongs to household
    const existingRule = await prisma.payeeCategoryRule.findFirst({
      where: { id, householdId },
    });

    if (!existingRule) {
      return NextResponse.json({ success: false, error: 'Rule not found' }, { status: 404 });
    }

    await prisma.payeeCategoryRule.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Error deleting payee category rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete payee category rule' },
      { status: 500 }
    );
  }
}
