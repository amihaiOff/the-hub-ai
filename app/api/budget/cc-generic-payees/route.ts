import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { getFirstZodError } from '@/lib/validations/common';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

/**
 * GET /api/budget/cc-generic-payees
 * List all generic CC payee names for the active household.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const items = await prisma.ccGenericPayeeName.findMany({
      where: { householdId: context.activeHousehold.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('Error fetching CC generic payee names:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch CC generic payee names' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/budget/cc-generic-payees
 * Add a new generic CC payee name.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { name } = validation.data;
    const householdId = context.activeHousehold.id;

    try {
      const item = await prisma.ccGenericPayeeName.create({
        data: { name, householdId },
        select: { id: true, name: true },
      });
      return NextResponse.json({ success: true, data: item }, { status: 201 });
    } catch {
      return NextResponse.json(
        { success: false, error: 'That name already exists' },
        { status: 409 }
      );
    }
  } catch (error) {
    console.error('Error creating CC generic payee name:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create CC generic payee name' },
      { status: 500 }
    );
  }
}
