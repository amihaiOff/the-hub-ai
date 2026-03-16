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

    // If categoryId is being updated, verify it belongs to household
    if (data.categoryId) {
      const category = await prisma.budgetCategory.findFirst({
        where: { id: data.categoryId, householdId },
      });
      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
    }

    const updatedRule = await prisma.payeeCategoryRule.update({
      where: { id },
      data,
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
        categoryName: updatedRule.category.name,
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
