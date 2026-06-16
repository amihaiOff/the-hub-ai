import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { getFirstZodError } from '@/lib/validations/common';

// Loose validation: accept anything that looks like an international phone
// number after trimming. The wa.me deep link only cares about digits, but
// keeping the user's formatting helps them recognize what they entered.
const createSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(60)
    .transform((s) => s.trim()),
  phone: z
    .string()
    .max(32)
    .transform((s) => s.trim())
    .refine((s) => /^\+?[0-9 ()\-]{7,}$/.test(s), {
      message: 'Use international format, e.g. +972501234567',
    }),
});

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const contacts = await prisma.partnerContact.findMany({
    where: { householdId: context.activeHousehold.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, phone: true, createdAt: true },
  });
  return NextResponse.json({ success: true, data: contacts });
}

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
    const created = await prisma.partnerContact.create({
      data: {
        name: validation.data.name,
        phone: validation.data.phone,
        householdId: context.activeHousehold.id,
      },
      select: { id: true, name: true, phone: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { success: false, error: 'A contact with that phone already exists' },
        { status: 409 }
      );
    }
    console.error('Error creating partner contact:', error);
    return NextResponse.json({ success: false, error: 'Failed to create' }, { status: 500 });
  }
}
