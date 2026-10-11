import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { DEFAULT_REPORT_PROMPT, REPORT_CONTRACT } from '@/lib/budget-report/prompt';

const updateSchema = z.object({
  prompt: z.string().max(20000).nullable(),
});

/** GET/PUT /api/settings/report-prompt — the monthly report agent's prompt. */
export async function GET() {
  const context = await getCurrentContext();
  if (!context) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const household = await prisma.household.findUnique({
    where: { id: context.activeHousehold.id },
    select: { reportPrompt: true },
  });
  return NextResponse.json({
    success: true,
    data: {
      prompt: household?.reportPrompt ?? null,
      defaultPrompt: DEFAULT_REPORT_PROMPT,
      contract: REPORT_CONTRACT,
    },
  });
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }
    // Blank or identical to the default → store null so future default
    // improvements apply.
    const raw = parsed.data.prompt?.trim() ?? '';
    const value = raw && raw !== DEFAULT_REPORT_PROMPT.trim() ? parsed.data.prompt : null;
    await prisma.household.update({
      where: { id: context.activeHousehold.id },
      data: { reportPrompt: value },
    });
    return NextResponse.json({ success: true, data: { prompt: value } });
  } catch (error) {
    console.error('Report prompt update failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
