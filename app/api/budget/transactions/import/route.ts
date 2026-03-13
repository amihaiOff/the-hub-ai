import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { importBulkSchema } from '@/lib/validations/budget';
import { getFirstZodError } from '@/lib/validations/common';
import { importTransactions } from '@/lib/utils/import-transactions';

/**
 * POST /api/budget/transactions/import
 * Import transactions from Riseup CSV with payee resolution and category matching.
 *
 * - Resolves payees by name (case-insensitive), creates new ones for unknowns
 * - Auto-creates new Riseup categories from CSV (skips deleted ones)
 * - Matches Riseup categories → app categories via DB mapping
 * - Falls back to payee's default category if no mapping
 * - Detects duplicates: transactionDate + payeeName.toLowerCase() + amountIls
 * - Creates transactions one-by-one (Neon compatibility)
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const body = await request.json();
    const validation = importBulkSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { transactions } = validation.data;

    const result = await importTransactions(householdId, transactions);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error importing transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import transactions' },
      { status: 500 }
    );
  }
}
