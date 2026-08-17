import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createPageSectionSchema } from '@/lib/validations/pages';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * GET /api/pages/sections
 * Lists the active household's page sections, ordered for the Areas popup.
 */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const sections = await prisma.pageSection.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, sortOrder: true },
  });

  return NextResponse.json({ success: true, data: sections });
}

/**
 * POST /api/pages/sections
 * Create a section. New sections sort at the end of the list.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = createPageSectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }

    const bottom = await prisma.pageSection.findFirst({
      where: { householdId: context.activeHousehold.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const created = await prisma.pageSection.create({
      data: {
        name: parsed.data.name,
        sortOrder: (bottom?.sortOrder ?? 0) + 1,
        householdId: context.activeHousehold.id,
      },
      select: { id: true, name: true, sortOrder: true },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to create section' },
      { status: 500 }
    );
  }
}
