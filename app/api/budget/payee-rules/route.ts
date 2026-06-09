import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createPayeeCategoryRuleSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/budget/payee-rules
 * List all payee category rules for the current household
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const rules = await prisma.payeeCategoryRule.findMany({
      where: { householdId },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const transformedRules = rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      operator: rule.operator,
      value: rule.value,
      categoryId: rule.categoryId,
      categoryName: rule.category?.name ?? null,
      markNeverDefault: rule.markNeverDefault,
      sortOrder: rule.sortOrder,
      isActive: rule.isActive,
      householdId: rule.householdId,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    }));

    return NextResponse.json({ success: true, data: transformedRules });
  } catch (error) {
    console.error('Error fetching payee category rules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payee category rules' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/payee-rules
 * Create a new payee category rule
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = createPayeeCategoryRuleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name, operator, value, categoryId, markNeverDefault, sortOrder, isActive } =
      validation.data;

    // Require exactly one mode: assign a category OR mark never-default.
    if (!markNeverDefault && !categoryId) {
      return NextResponse.json(
        { success: false, error: 'Rule must either set a category or markNeverDefault' },
        { status: 400 }
      );
    }

    // Verify category belongs to household (only when assigning a category)
    let categoryName: string | null = null;
    if (categoryId) {
      const category = await prisma.budgetCategory.findFirst({
        where: { id: categoryId, householdId },
      });
      if (!category) {
        return NextResponse.json({ success: false, error: 'Category not found' }, { status: 404 });
      }
      categoryName = category.name;
    }

    // If no sortOrder provided, set to max + 1
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined) {
      const maxRule = await prisma.payeeCategoryRule.findFirst({
        where: { householdId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      finalSortOrder = (maxRule?.sortOrder ?? -1) + 1;
    }

    const rule = await prisma.payeeCategoryRule.create({
      data: {
        name,
        operator,
        value,
        categoryId: categoryId ?? null,
        markNeverDefault: markNeverDefault === true,
        sortOrder: finalSortOrder,
        isActive,
        householdId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...rule,
        categoryName,
      },
    });
  } catch (error) {
    console.error('Error creating payee category rule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create payee category rule' },
      { status: 500 }
    );
  }
}
