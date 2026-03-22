import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface ParsedPolicyRow {
  mainBranch: string;
  subBranch: string | null;
  productType: string | null;
  company: string | null;
  insurancePeriod: string | null;
  additionalDetails: string | null;
  premiumIls: number | null;
  premiumType: string | null;
  policyNumber: string | null;
  planClassification: string | null;
}

/**
 * Parse the "הר הביטוח" Excel file.
 *
 * Excel structure (sheet: "תיק ביטוחי"):
 *   Row 0: possibly blank/title
 *   Row 1-2: blank or sub-headers
 *   Row 3 (index 2): headers
 *   Row 4+: data rows or section rows
 *
 * Section rows have col[0] = null/undefined and col[1] starting with "תחום -"
 * Data rows have all the policy columns populated.
 *
 * Column order (0-indexed, after the ID column at index 0):
 *   0: תעודת זהות
 *   1: ענף ראשי
 *   2: ענף (משני)
 *   3: סוג מוצר
 *   4: חברה
 *   5: תקופת ביטוח
 *   6: פרטים נוספים
 *   7: פרמיה בש"ח
 *   8: סוג פרמיה
 *   9: מספר פוליסה
 *   10: סיווג תכנית
 */
function parseInsuranceExcel(buffer: Buffer): ParsedPolicyRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellNF: true });

  // Try to find the sheet "תיק ביטוחי" or fall back to first sheet
  const sheetName =
    workbook.SheetNames.find((n) => n.includes('תיק ביטוח')) ?? workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('No sheet found in workbook');
  }

  const sheet = workbook.Sheets[sheetName];

  // The הר הביטוח export has a stale !ref range that doesn't cover all data rows.
  // Extend the range to a large number to force reading all cells.
  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    range.e.r = Math.max(range.e.r, 2000);
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }

  // Convert to array of arrays (raw values)
  const rows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  const policies: ParsedPolicyRow[] = [];

  // Find the header row (look for row containing "ענף ראשי")
  let dataStartRow = 3; // default
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (row && row.some((cell) => String(cell ?? '').includes('ענף ראשי'))) {
      dataStartRow = i + 1; // data starts after header row
      break;
    }
  }

  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Skip section rows: col[0] is null and col[1] starts with "תחום -"
    const col0 = row[0];
    const col1 = String(row[1] ?? '');
    if ((col0 === null || col0 === undefined || col0 === '') && col1.startsWith('תחום -')) {
      continue;
    }

    // Skip rows without a main branch (col index 1)
    const mainBranch = String(row[1] ?? '').trim();
    if (!mainBranch) continue;

    const premiumRaw = row[7];
    let premiumIls: number | null = null;
    if (premiumRaw !== null && premiumRaw !== undefined && premiumRaw !== '') {
      const parsed =
        typeof premiumRaw === 'number'
          ? premiumRaw
          : parseFloat(String(premiumRaw).replace(/,/g, ''));
      if (!isNaN(parsed)) {
        premiumIls = parsed;
      }
    }

    policies.push({
      mainBranch,
      subBranch: row[2] ? String(row[2]).trim() || null : null,
      productType: row[3] ? String(row[3]).trim() || null : null,
      company: row[4] ? String(row[4]).trim() || null : null,
      insurancePeriod: row[5] ? String(row[5]).trim() || null : null,
      additionalDetails: row[6] ? String(row[6]).trim() || null : null,
      premiumIls,
      premiumType: row[8] ? String(row[8]).trim() || null : null,
      policyNumber: row[9] ? String(row[9]).trim() || null : null,
      planClassification: row[10] ? String(row[10]).trim() || null : null,
    });
  }

  return policies;
}

/**
 * POST /api/insurance/import
 * Accept multipart file upload of Excel (.xlsx), parse it and import policies
 * under the specified profile.
 *
 * Form fields:
 *   file: the .xlsx file
 *   profileId: the profile to assign policies to
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid form data. Send multipart/form-data.' },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    const profileId = formData.get('profileId');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded. Include a "file" field with an .xlsx file.' },
        { status: 400 }
      );
    }

    if (!profileId || typeof profileId !== 'string' || !profileId.trim()) {
      return NextResponse.json({ success: false, error: 'profileId is required' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only .xlsx files are accepted.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Verify profile belongs to this household
    const member = await prisma.householdMember.findFirst({
      where: { householdId, profileId },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: 'Profile not found in household' },
        { status: 400 }
      );
    }

    // Parse Excel
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parsedPolicies: ParsedPolicyRow[];
    try {
      parsedPolicies = parseInsuranceExcel(buffer);
    } catch (parseError) {
      console.error('Excel parse error:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to parse Excel file. Make sure it is a valid הר הביטוח export.',
        },
        { status: 400 }
      );
    }

    if (parsedPolicies.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No policies found in the file. The file appears to be empty or contain only section headers. Make sure you exported a file with actual policy data from הר הביטוח.',
        },
        { status: 400 }
      );
    }

    // Delete existing policies for this profile in this household (replace on import)
    await prisma.insurancePolicy.deleteMany({
      where: { householdId, profileId },
    });

    // Create policies one by one (Neon compatibility - no createMany)
    let created = 0;
    for (const policy of parsedPolicies) {
      await prisma.insurancePolicy.create({
        data: {
          profileId,
          householdId,
          mainBranch: policy.mainBranch,
          subBranch: policy.subBranch,
          productType: policy.productType,
          company: policy.company,
          insurancePeriod: policy.insurancePeriod,
          additionalDetails: policy.additionalDetails,
          premiumIls: policy.premiumIls != null ? policy.premiumIls : null,
          premiumType: policy.premiumType,
          policyNumber: policy.policyNumber,
          planClassification: policy.planClassification,
        },
      });
      created++;
    }

    return NextResponse.json({
      success: true,
      data: { imported: created },
    });
  } catch (error) {
    console.error('Error importing insurance Excel:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import insurance data' },
      { status: 500 }
    );
  }
}
