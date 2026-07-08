import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { getFirstZodError } from '@/lib/validations/common';
import { categorizeTransaction, type CategoryOption } from '@/lib/ai/categorize-transaction';

// Web search per transaction can take a few seconds; allow a generous ceiling.
export const maxDuration = 60;

// Below this confidence we log the attempt but do NOT attach a suggestion.
const CONFIDENCE_THRESHOLD = 0.6;
// How many transactions to process in one run (bounds cost and wall-clock).
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;
const CONCURRENCY = 3;

const bodySchema = z.object({
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  transactionIds: z.array(z.string()).max(MAX_LIMIT).optional(),
});

/** Run `worker` over `items` with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    const body = await request.json().catch(() => ({}));
    const validation = bodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }
    const limit = validation.data.limit ?? DEFAULT_LIMIT;

    // Resolve the API key: household setting first, env var as a fallback.
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { anthropicApiKey: true },
    });
    const apiKey = household?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'No Anthropic API key configured. Add one in Settings.' },
        { status: 400 }
      );
    }

    // Categories to choose from.
    const categoryRows = await prisma.budgetCategory.findMany({
      where: { householdId },
      select: { id: true, name: true, group: { select: { name: true } } },
    });
    if (categoryRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No budget categories to choose from.' },
        { status: 400 }
      );
    }
    const categories: CategoryOption[] = categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      group: c.group.name,
    }));
    const nameById = new Map(categoryRows.map((c) => [c.id, c.name]));

    // Uncategorized expense transactions that don't already carry a suggestion.
    const where: {
      householdId: string;
      isDeleted: boolean;
      type: 'expense';
      categoryId: null;
      suggestedCategoryId: null;
      tags: { none: object };
      id?: { in: string[] };
    } = {
      householdId,
      isDeleted: false,
      type: 'expense',
      categoryId: null,
      suggestedCategoryId: null,
      tags: { none: {} },
    };
    if (validation.data.transactionIds?.length) {
      where.id = { in: validation.data.transactionIds };
    }

    const transactions = await prisma.budgetTransaction.findMany({
      where,
      include: { payee: { select: { name: true } } },
      orderBy: [{ transactionDate: 'desc' }],
      take: limit,
    });

    const counts = { suggested: 0, lowConfidence: 0, noMatch: 0, errors: 0, processed: 0 };

    await mapPool(transactions, CONCURRENCY, async (tx) => {
      const name = tx.payee?.name || tx.notes || 'Unknown transaction';
      counts.processed++;
      try {
        const result = await categorizeTransaction(apiKey, {
          name,
          amountIls: Number(tx.amountIls),
          notes: tx.notes,
          categories,
        });

        const chosenName = result.categoryId ? (nameById.get(result.categoryId) ?? null) : null;
        let status: 'suggested' | 'low_confidence' | 'no_match';

        if (!result.categoryId) {
          status = 'no_match';
          counts.noMatch++;
        } else if (result.confidence < CONFIDENCE_THRESHOLD) {
          status = 'low_confidence';
          counts.lowConfidence++;
        } else {
          status = 'suggested';
          counts.suggested++;
          await prisma.budgetTransaction.update({
            where: { id: tx.id },
            data: {
              suggestedCategoryId: result.categoryId,
              suggestionConfidence: result.confidence,
              suggestedAt: new Date(),
            },
          });
        }

        await prisma.budgetCategorizationLog.create({
          data: {
            householdId,
            transactionId: tx.id,
            transactionName: name,
            status,
            resultCategoryId: result.categoryId,
            resultCategoryName: chosenName,
            confidence: result.confidence,
            reasoning: result.reasoning || null,
          },
        });
      } catch (err) {
        counts.errors++;
        // Never let a logging failure escape the worker — one bad write must
        // not reject Promise.all and 500 the whole batch (dropping partial
        // counts and leaving some transactions already suggested).
        try {
          await prisma.budgetCategorizationLog.create({
            data: {
              householdId,
              transactionId: tx.id,
              transactionName: name,
              status: 'error',
              reasoning: err instanceof Error ? err.message.slice(0, 500) : 'Unknown error',
            },
          });
        } catch (logErr) {
          console.error('Failed to write categorization error log:', logErr);
        }
      }
    });

    return NextResponse.json({ success: true, data: counts });
  } catch (error) {
    console.error('Error suggesting categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to suggest categories' },
      { status: 500 }
    );
  }
}
