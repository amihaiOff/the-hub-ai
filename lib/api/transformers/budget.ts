import { Prisma } from '@prisma/client';

/**
 * Serialisers shared across all budget-transaction API routes.
 *
 * Route handlers used to copy the same `transformTransaction` body into
 * every file (`/api/budget/transactions/route.ts`,
 * `.../[id]/route.ts`, and more). That let the response contract drift —
 * one route would add a field, another wouldn't, and clients would see
 * inconsistent shapes.
 *
 * Every route that returns a BudgetTransaction now imports this. Adding a
 * field is one edit here.
 */

/** Shape of a Prisma row with the relations these serialisers need. */
export interface BudgetTransactionRow {
  id: string;
  type: string;
  transactionDate: Date;
  paymentDate: Date | null;
  amountIls: Prisma.Decimal;
  currency: string;
  amountOriginal: Prisma.Decimal;
  categoryId: string | null;
  suggestedCategoryId: string | null;
  suggestionConfidence: number | null;
  payeeId: string | null;
  paymentMethod: string;
  paymentNumber: number | null;
  totalPayments: number | null;
  notes: string | null;
  source: string;
  isRecurring: boolean;
  isSplit: boolean;
  originalTransactionId: string | null;
  paymentIdentifier: string | null;
  excludedFromFlow: boolean;
  profileId: string | null;
  householdId: string;
  createdAt: Date;
  updatedAt: Date;
  mergedFromId?: string | null;
  tags?: { tag: { id: string } }[];
  category?: { id: string; name: string } | null;
  suggestedCategory?: { id: string; name: string } | null;
  payee?: { id: string; name: string } | null;
  profile?: { id: string; name: string } | null;
  mergedFrom?: {
    id: string;
    transactionDate: Date;
    amountIls: Prisma.Decimal;
    moneytorId: string | null;
    source: string;
    notes: string | null;
    categoryId: string | null;
    isDeleted: boolean;
  } | null;
}

/**
 * Convert a Prisma BudgetTransaction (+ its usual relations) into the
 * JSON shape the client hooks expect. All Decimal values → number,
 * dates → `YYYY-MM-DD` for calendar-only columns and full ISO for
 * timestamps, relations flattened into `*Name` mirrors.
 */
/**
 * The JSON shape API clients receive. Exported so `lib/hooks/use-budget.ts`
 * (and any other consumer) can pin its own type to this one — prevents
 * response-shape drift between server and client.
 *
 * If you add a field to the transformer body below, this type updates
 * automatically via `ReturnType`. TypeScript will then flag any client
 * hook whose local `BudgetTransaction` interface still lacks the field.
 */
export type BudgetTransactionResponse = ReturnType<typeof transformTransaction>;

export function transformTransaction(tx: BudgetTransactionRow) {
  return {
    id: tx.id,
    type: tx.type,
    transactionDate: tx.transactionDate.toISOString().split('T')[0],
    paymentDate: tx.paymentDate?.toISOString().split('T')[0] ?? null,
    amountIls: Number(tx.amountIls),
    currency: tx.currency,
    amountOriginal: Number(tx.amountOriginal),
    categoryId: tx.categoryId,
    categoryName: tx.category?.name ?? null,
    suggestedCategoryId: tx.suggestedCategoryId,
    suggestedCategoryName: tx.suggestedCategory?.name ?? null,
    suggestionConfidence: tx.suggestionConfidence,
    payeeId: tx.payeeId,
    payeeName: tx.payee?.name ?? null,
    paymentMethod: tx.paymentMethod,
    paymentNumber: tx.paymentNumber,
    totalPayments: tx.totalPayments,
    notes: tx.notes,
    source: tx.source,
    isRecurring: tx.isRecurring,
    isSplit: tx.isSplit,
    originalTransactionId: tx.originalTransactionId,
    paymentIdentifier: tx.paymentIdentifier,
    excludedFromFlow: tx.excludedFromFlow,
    profileId: tx.profileId,
    profileName: tx.profile?.name ?? null,
    householdId: tx.householdId,
    tagIds: tx.tags?.map((t) => t.tag.id) ?? [],
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    mergedFromId: tx.mergedFromId ?? null,
    mergedFrom: tx.mergedFrom
      ? {
          id: tx.mergedFrom.id,
          transactionDate: tx.mergedFrom.transactionDate.toISOString().split('T')[0],
          amountIls: Number(tx.mergedFrom.amountIls),
          moneytorId: tx.mergedFrom.moneytorId,
          source: tx.mergedFrom.source,
          notes: tx.mergedFrom.notes,
          categoryId: tx.mergedFrom.categoryId,
          isDeleted: tx.mergedFrom.isDeleted,
        }
      : null,
  };
}
