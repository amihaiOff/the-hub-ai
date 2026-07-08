import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';

// PUT accepts either a new key (string) or an explicit null to clear it.
const updateSchema = z.object({
  apiKey: z.string().trim().max(500).nullable(),
});

/** Show only whether a key is set plus a masked hint — never the raw key. */
function maskKey(key: string | null): string | null {
  if (!key) return null;
  const tail = key.slice(-4);
  return `…${tail}`;
}

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const household = await prisma.household.findUnique({
    where: { id: context.activeHousehold.id },
    select: { anthropicApiKey: true },
  });
  const key = household?.anthropicApiKey ?? null;
  return NextResponse.json({
    success: true,
    data: { hasKey: !!key, maskedKey: maskKey(key) },
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
    // Empty string clears the key; otherwise store the trimmed value.
    const trimmed = validation.data.apiKey?.trim();
    const next = trimmed && trimmed.length > 0 ? trimmed : null;
    const updated = await prisma.household.update({
      where: { id: context.activeHousehold.id },
      data: { anthropicApiKey: next },
      select: { anthropicApiKey: true },
    });
    return NextResponse.json({
      success: true,
      data: { hasKey: !!updated.anthropicApiKey, maskedKey: maskKey(updated.anthropicApiKey) },
    });
  } catch (error) {
    console.error('Error updating Anthropic API key:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
