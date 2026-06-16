import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { getFirstZodError } from '@/lib/validations/common';

// Loose validation: accept anything that looks like an international phone
// number after stripping spaces, dashes and parentheses. The wa.me deep link
// itself only cares about the digits.
const updateSchema = z.object({
  phone: z
    .string()
    .max(32)
    .nullable()
    .transform((v) => (v === null ? null : v.trim()))
    .refine((v) => v === null || v === '' || /^\+?[0-9 ()\-]{7,}$/.test(v), {
      message: 'Use international format, e.g. +972501234567',
    })
    .transform((v) => (v === '' ? null : v)),
});

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const household = await prisma.household.findUnique({
    where: { id: context.activeHousehold.id },
    select: { partnerPhone: true },
  });
  return NextResponse.json({ success: true, data: { phone: household?.partnerPhone ?? null } });
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
      data: { partnerPhone: validation.data.phone },
      select: { partnerPhone: true },
    });
    return NextResponse.json({ success: true, data: { phone: updated.partnerPhone } });
  } catch (error) {
    console.error('Error updating partner phone:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
