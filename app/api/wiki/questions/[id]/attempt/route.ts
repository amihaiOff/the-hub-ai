import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';

const attemptSchema = z.object({
  selectedIdx: z.number().int().min(0).max(3),
});

/** POST /api/wiki/questions/[id]/attempt — record a radio-pick for scoring. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = attemptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(parsed.error) },
        { status: 400 }
      );
    }

    // Scope-check: question must belong to a concept in the active household.
    const question = await prisma.wikiQuestion.findFirst({
      where: {
        id,
        concept: { householdId: context.activeHousehold.id },
      },
      select: { id: true, correctIdx: true },
    });
    if (!question) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const correct = parsed.data.selectedIdx === question.correctIdx;
    await prisma.wikiQuestionAttempt.create({
      data: {
        questionId: id,
        userId: context.user.id,
        selectedIdx: parsed.data.selectedIdx,
        correct,
      },
    });

    return NextResponse.json({
      success: true,
      data: { correct, correctIdx: question.correctIdx },
    });
  } catch (error) {
    console.error('Wiki attempt log failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record attempt' },
      { status: 500 }
    );
  }
}
