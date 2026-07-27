import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * Household-scoped scratchpad, one block per household. Any member reads
 * and writes the same text; concurrent edits last-write-win by intent
 * (the debounced client autosave means edits from two members within the
 * same second race, but the scratchpad's whole point is throwaway notes,
 * so the trade is fine).
 */

const updateSchema = z.object({
  notes: z.string().max(50_000).nullable(),
});

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const household = await prisma.household.findUnique({
    where: { id: context.activeHousehold.id },
    select: { dashboardNotes: true },
  });
  return NextResponse.json({
    success: true,
    data: { notes: household?.dashboardNotes ?? '' },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    const value = parsed.data.notes && parsed.data.notes.trim() ? parsed.data.notes : null;
    await prisma.household.update({
      where: { id: context.activeHousehold.id },
      data: { dashboardNotes: value },
    });
    return NextResponse.json({ success: true, data: { notes: value ?? '' } });
  } catch (error) {
    console.error('Dashboard notes update failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
