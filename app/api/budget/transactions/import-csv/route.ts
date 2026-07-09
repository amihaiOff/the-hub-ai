import { NextRequest, NextResponse, after } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { getHouseholdIdFromApiKey } from '@/lib/auth-api-key';
import { parseRiseupCSV } from '@/lib/utils/riseup-csv-parser';
import { importBulkSchema } from '@/lib/validations/budget';
import { importTransactions } from '@/lib/utils/import-transactions';
import { runPostImportSuggestion } from '@/lib/ai/post-import-suggestion';

// Give the post-response AI categorization pass headroom under the timeout.
export const maxDuration = 60;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/budget/transactions/import-csv
 * Accept a Riseup CSV file upload (multipart/form-data), parse it server-side,
 * and import the transactions. Enables programmatic uploads without the UI.
 *
 * Auth: session cookie OR `Authorization: Bearer <API_SECRET>` header.
 */
export async function POST(request: NextRequest) {
  try {
    // Try session auth first, then API key
    let householdId: string | null = null;

    try {
      const context = await getCurrentContext();
      if (context) {
        householdId = context.activeHousehold.id;
      }
    } catch {
      // Session auth failed (e.g. DB error), will try API key
    }

    if (!householdId) {
      householdId = await getHouseholdIdFromApiKey(request);
    }

    if (!householdId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid form data. Send multipart/form-data with a "file" field.',
        },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded. Include a "file" field with a CSV file.' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only .csv files are accepted.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is 5MB.` },
        { status: 400 }
      );
    }

    // Read and parse CSV
    const csvText = await file.text();
    const parseResult = parseRiseupCSV(csvText);

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: 'CSV parsing failed', details: parseResult.errors },
        { status: 400 }
      );
    }

    if (parseResult.transactions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid transactions found in CSV.' },
        { status: 400 }
      );
    }

    // Validate parsed transactions through the import schema
    const validation = importBulkSchema.safeParse({ transactions: parseResult.transactions });
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Parsed transactions failed validation',
          details: validation.error.issues.map((i) => i.message),
        },
        { status: 400 }
      );
    }

    // Import using shared logic
    const result = await importTransactions(householdId, validation.data.transactions);

    // Fire an AI categorization pass after the response is sent so the upload
    // stays fast; the cron drain handles anything this bounded pass misses.
    if (result.created > 0) {
      after(() => runPostImportSuggestion(householdId));
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    return NextResponse.json({ success: false, error: 'Failed to import CSV' }, { status: 500 });
  }
}
