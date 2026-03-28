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

  /**
   * Detect format type from a header row.
   * Returns 'har-habitua' (10-col with ענף ראשי) or 'shaban' (7-col without ענף ראשי).
   */
  function detectFormat(
    row: (string | number | null | undefined)[]
  ): 'har-habitua' | 'shaban' | null {
    const cells = row.map((c) => String(c ?? '').trim());
    if (cells.includes('ענף ראשי')) return 'har-habitua';
    if (cells.includes('ענף (משני)') && cells.includes('סוג פרמיה')) return 'shaban';
    return null;
  }

  // Build column index map from a header row
  function buildColMap(row: (string | number | null | undefined)[]): Record<string, number> {
    const map: Record<string, number> = {};
    row.forEach((cell, idx) => {
      const key = String(cell ?? '').trim();
      if (key) map[key] = idx;
    });
    return map;
  }

  // Scan the whole sheet for header rows — the file may contain multiple sections
  const sections: {
    startRow: number;
    format: 'har-habitua' | 'shaban';
    colMap: Record<string, number>;
  }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const fmt = detectFormat(row);
    if (fmt) sections.push({ startRow: i + 1, format: fmt, colMap: buildColMap(row) });
  }

  // If no sections found, try default (original format)
  if (sections.length === 0) {
    const defaultColMap = {
      'ענף ראשי': 1,
      'ענף (משני)': 2,
      'סוג מוצר': 3,
      חברה: 4,
      'תקופת ביטוח': 5,
      'פרטים נוספים': 6,
      'פרמיה בש"ח': 7,
      'סוג פרמיה': 8,
      'מספר פוליסה': 9,
      'סיווג תכנית': 10,
    };
    sections.push({ startRow: 4, format: 'har-habitua', colMap: defaultColMap });
  }

  function getCell(
    row: (string | number | null | undefined)[],
    colMap: Record<string, number>,
    key: string
  ): string | number | null | undefined {
    const idx = colMap[key];
    return idx !== undefined ? row[idx] : null;
  }

  function parsePremium(raw: string | number | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
    return isNaN(parsed) ? null : parsed;
  }

  for (const section of sections) {
    const { colMap } = section;
    const nextSectionStart = sections.find((s) => s.startRow > section.startRow)?.startRow;
    const endRow = nextSectionStart ? nextSectionStart - 2 : rows.length;

    for (let i = section.startRow; i < endRow; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const col0 = row[0];
      const col1 = String(row[1] ?? '').trim();

      // Skip title rows, section separators, and header-like rows
      if (
        (col0 === null || col0 === undefined || col0 === '') &&
        (col1.startsWith('תחום -') || col1.startsWith('כיסויי') || col1.startsWith('התיק'))
      )
        continue;
      if (String(col0 ?? '').includes('תעודת זהות')) continue;
      if (!col1) continue;

      if (section.format === 'har-habitua') {
        // Use colMap to find premium — handles both 10-col and 11-col variants
        const premiumKey = Object.keys(colMap).find((k) => k.startsWith('פרמיה')) ?? 'פרמיה בש"ח';
        const premiumTypeKey = 'סוג פרמיה';
        const policyKey = 'מספר פוליסה';

        policies.push({
          mainBranch: col1,
          subBranch: row[colMap['ענף (משני)'] ?? 2]
            ? String(row[colMap['ענף (משני)'] ?? 2])
                .trim()
                .replace(/\r\n|\n/g, ' ') || null
            : null,
          productType: row[colMap['סוג מוצר'] ?? 3]
            ? String(row[colMap['סוג מוצר'] ?? 3]).trim() || null
            : null,
          company: row[colMap['חברה'] ?? 4]
            ? String(row[colMap['חברה'] ?? 4]).trim() || null
            : null,
          insurancePeriod: row[colMap['תקופת ביטוח'] ?? 5]
            ? String(row[colMap['תקופת ביטוח'] ?? 5]).trim() || null
            : null,
          additionalDetails:
            colMap['פרטים נוספים'] !== undefined
              ? row[colMap['פרטים נוספים']]
                ? String(row[colMap['פרטים נוספים']]).trim() || null
                : null
              : null,
          premiumIls: parsePremium(getCell(row, colMap, premiumKey)),
          premiumType: getCell(row, colMap, premiumTypeKey)
            ? String(getCell(row, colMap, premiumTypeKey)).trim() || null
            : null,
          policyNumber:
            getCell(row, colMap, policyKey) != null
              ? String(getCell(row, colMap, policyKey)).trim() || null
              : null,
          planClassification: getCell(row, colMap, 'סיווג תכנית')
            ? String(getCell(row, colMap, 'סיווג תכנית')).trim() || null
            : null,
        });
      } else {
        // שב"ן format: ID | ענף (משני) | סוג מוצר | חברה | תקופת כיסוי | פרמיה | סוג פרמיה
        const productType = row[colMap['סוג מוצר'] ?? 2]
          ? String(row[colMap['סוג מוצר'] ?? 2]).trim() || null
          : null;
        const premiumKey = Object.keys(colMap).find((k) => k.startsWith('פרמיה')) ?? 'פרמיה בש"ח';
        const periodKey = Object.keys(colMap).find((k) => k.startsWith('תקופת')) ?? 'תקופת כיסוי';

        policies.push({
          mainBranch: productType ?? 'שב"ן',
          subBranch: col1.replace(/\r\n|\n/g, ' ') || null,
          productType,
          company: row[colMap['חברה'] ?? 3]
            ? String(row[colMap['חברה'] ?? 3]).trim() || null
            : null,
          insurancePeriod: getCell(row, colMap, periodKey)
            ? String(getCell(row, colMap, periodKey)).trim() || null
            : null,
          additionalDetails: null,
          premiumIls: parsePremium(getCell(row, colMap, premiumKey)),
          premiumType: getCell(row, colMap, 'סוג פרמיה')
            ? String(getCell(row, colMap, 'סוג פרמיה')).trim() || null
            : null,
          policyNumber: null,
          planClassification: null,
        });
      }
    }
  }

  // Legacy path kept for backward compat — only reached if sections logic produced nothing
  if (policies.length > 0) return policies;

  // Fallback: original single-section logic
  let dataStartRow = 3;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (row && row.some((cell) => String(cell ?? '').includes('ענף ראשי'))) {
      dataStartRow = i + 1;
      break;
    }
  }

  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const col0 = row[0];
    const col1 = String(row[1] ?? '');
    if ((col0 === null || col0 === undefined || col0 === '') && col1.startsWith('תחום -')) continue;
    const mainBranch = String(row[1] ?? '').trim();
    if (!mainBranch) continue;
    const premiumRaw = row[7];
    let premiumIls: number | null = null;
    if (premiumRaw !== null && premiumRaw !== undefined && premiumRaw !== '') {
      const parsed =
        typeof premiumRaw === 'number'
          ? premiumRaw
          : parseFloat(String(premiumRaw).replace(/,/g, ''));
      if (!isNaN(parsed)) premiumIls = parsed;
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
