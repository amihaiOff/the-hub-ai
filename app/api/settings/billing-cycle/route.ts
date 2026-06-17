import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { VALID_BILLING_CYCLE_DAYS } from '@/lib/utils/billing-cycle';

const updateSchema = z.object({
  startDay: z
    .number()
    .int()
    .refine((n) => VALID_BILLING_CYCLE_DAYS.includes(n as 1 | 2 | 10), {
      message: `startDay must be one of ${VALID_BILLING_CYCLE_DAYS.join(', ')}`,
    }),
});

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const household = await prisma.household.findUnique({
    where: { id: context.activeHousehold.id },
    select: { billingCycleStartDay: true },
  });
  return NextResponse.json({
    success: true,
    data: { startDay: household?.billingCycleStartDay ?? 1 },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const validation = updateSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }
    const updated = await prisma.household.update({
      where: { id: context.activeHousehold.id },
      data: { billingCycleStartDay: validation.data.startDay },
      select: { billingCycleStartDay: true },
    });
    return NextResponse.json({
      success: true,
      data: { startDay: updated.billingCycleStartDay },
    });
  } catch (error) {
    console.error('Error updating billing cycle:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
