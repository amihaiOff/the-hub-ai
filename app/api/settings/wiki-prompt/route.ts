import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { DEFAULT_WIKI_PROMPT } from '@/lib/ai/wiki-summarize';

const updateSchema = z.object({
  prompt: z.string().max(4000).nullable(),
});

export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const household = await prisma.household.findUnique({
    where: { id: context.activeHousehold.id },
    select: { wikiPrompt: true },
  });
  return NextResponse.json({
    success: true,
    data: {
      prompt: household?.wikiPrompt ?? null,
      defaultPrompt: DEFAULT_WIKI_PROMPT,
    },
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
    // Trim whitespace-only overrides back to null so we fall through to the
    // built-in default cleanly.
    const value = parsed.data.prompt && parsed.data.prompt.trim() ? parsed.data.prompt : null;
    await prisma.household.update({
      where: { id: context.activeHousehold.id },
      data: { wikiPrompt: value },
    });
    return NextResponse.json({ success: true, data: { prompt: value } });
  } catch (error) {
    console.error('Wiki prompt update failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
