import { ParsedDeposit, ParseResult } from './types';

// Use dynamic import to avoid pdf-parse's test file loading issue
async function getPdfParser() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  return pdfParse as (buffer: Buffer) => Promise<{ text: string }>;
}

/**
 * Parse a date string in DD/MM/YYYY format
 * Returns a Date at UTC midnight to avoid timezone issues
 */
function parseHebrewDate(text: string): Date | null {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  // Use Date.UTC to avoid timezone issues, then create a local date
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Parse a salary month string in MM/YYYY format to first of month
 * Returns a Date at UTC midnight to avoid timezone issues
 */
function parseSalaryMonth(text: string): Date | null {
  const match = text.match(/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, month, year] = match;
  // Use Date.UTC to avoid timezone issues
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Parse an amount string with comma separator (e.g., "3,155" -> 3155)
 */
function parseAmount(text: string): number {
  const cleaned = text.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Extract the provider name from PDF text
 */
function extractProviderName(text: string): string | null {
  if (text.includes('מיטב')) {
    return 'Meitav';
  }
  return null;
}

/**
 * Extract the report date from PDF text
 * Format: "תאריך הדוח: DD.MM.YYYY"
 */
function extractReportDate(text: string): Date | null {
  const match = text.match(/תאריך הדוח[:\s]+(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

/**
 * Extract member name from PDF text
 */
function extractMemberName(text: string): string | null {
  const match = text.match(/שם העמית[:\s]+([א-ת\s]+?)(?:\s+מספר|$)/m);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Parse the deposits table from Meitav PDF text
 *
 * The extracted text shows rows in this format (numbers concatenated):
 * 3,1551,2049401,01214,45412/202402/01/2025וויאנטיס בע"מ
 *
 * Breaking it down (RTL original order):
 * - Total: 3,155
 * - Severance: 1,204
 * - Employer contrib: 940
 * - Employee contrib: 1,012
 * - Salary: 14,454
 * - Salary Month: 12/2024
 * - Deposit Date: 02/01/2025
 * - Employer: וויאנטיס בע"מ
 */
function parseDepositsTable(text: string): {
  deposits: ParsedDeposit[];
  errors: string[];
} {
  const deposits: ParsedDeposit[] = [];
  const errors: string[] = [];

  // Split text into lines
  const lines = text.split('\n');

  for (const line of lines) {
    // Skip lines that don't look like deposit rows
    // Deposit rows have: numbers, salary month (MM/YYYY), deposit date (DD/MM/YYYY), and Hebrew employer name

    // Look for lines containing both date formats and Hebrew text (employer name with בע"מ)
    const hasDepositDate = /\d{2}\/\d{2}\/\d{4}/.test(line);
    const hasSalaryMonth = /\d{2}\/\d{4}/.test(line);
    const hasEmployer = /בע"מ|בע״מ/.test(line);

    if (!hasDepositDate || !hasSalaryMonth || !hasEmployer) {
      continue;
    }

    // Skip header/summary rows
    if (line.includes('שם המעסיק') || line.includes('סה"כ') || line.includes('מועד')) {
      continue;
    }

    try {
      // Extract deposit date (DD/MM/YYYY)
      const depositDateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (!depositDateMatch) continue;
      const depositDate = parseHebrewDate(depositDateMatch[1]);
      if (!depositDate) continue;

      // Extract salary month (MM/YYYY) - appears before the deposit date in the text
      // We need to find MM/YYYY that is NOT part of DD/MM/YYYY
      const salaryMonthMatch = line.match(/(\d{2}\/\d{4})(?=\d{2}\/\d{2}\/\d{4})/);
      if (!salaryMonthMatch) {
        // Try alternative: find all MM/YYYY patterns and take the one that's not part of a full date
        const allMonthMatches = line.match(/\d{2}\/\d{4}/g);
        if (!allMonthMatches || allMonthMatches.length === 0) continue;
        // The salary month should be the one that doesn't have a day prefix nearby
        // Use the first match that appears standalone
      }

      // Better approach: extract salary month by position
      // The format is: ...numbers...MM/YYYYDD/MM/YYYYemployer
      // Find salary month: MM/YYYY followed by DD/MM/YYYY
      const salaryMonthPattern = /(\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})/;
      const combinedMatch = line.match(salaryMonthPattern);

      let salaryMonth: Date | null = null;
      if (combinedMatch) {
        salaryMonth = parseSalaryMonth(combinedMatch[1]);
      } else {
        // Fallback: try to find standalone MM/YYYY
        const parts = line.split(/\d{2}\/\d{2}\/\d{4}/);
        if (parts[0]) {
          const monthMatch = parts[0].match(/(\d{2}\/\d{4})/);
          if (monthMatch) {
            salaryMonth = parseSalaryMonth(monthMatch[1]);
          }
        }
      }

      if (!salaryMonth) continue;

      // Extract employer name (Hebrew text ending with בע"מ)
      const employerMatch = line.match(/([א-ת][א-ת\s'"״]+(?:בע"מ|בע״מ))/);
      const employer = employerMatch ? employerMatch[1].trim() : 'Unknown';

      // Extract total amount (first number in the line, which is the total deposit)
      // The numbers appear as: total,severance,employer,employee,salary
      // e.g., 3,1551,2049401,01214,454

      // Number extraction:
      // Get all the text before the salary month
      const salaryMonthStr = `${String(salaryMonth.getMonth() + 1).padStart(2, '0')}/${salaryMonth.getFullYear()}`;
      const beforeSalaryMonth = line.split(salaryMonthStr)[0];

      // Extract numbers from this part
      // The format is: total(with comma)severance(with comma)employer(3 digits)employee(with comma)salary(with comma)
      // Example: 3,1551,2049401,01214,454

      // Parse the number string to extract individual amounts
      // Pattern: We know typical amounts:
      // - Total: 2,000-5,000 (4-5 chars with comma)
      // - Severance: 1,000-2,000 (4-5 chars with comma)
      // - Employer: 500-2,000 (3-5 chars)
      // - Employee: 500-2,000 (4-5 chars with comma)
      // - Salary: 10,000-20,000 (5-6 chars with comma)

      // Use regex to extract comma-separated numbers
      const amountPattern = /(\d{1,3}(?:,\d{3})*)/g;
      const amounts = beforeSalaryMonth.match(amountPattern);

      if (!amounts || amounts.length < 1) {
        errors.push(`Could not extract amounts from: ${line.substring(0, 50)}`);
        continue;
      }

      // The total is the first amount (in the extracted text order)
      const amount = parseAmount(amounts[0]);

      if (amount <= 0 || amount > 50000) {
        errors.push(`Invalid amount ${amount} from: ${line.substring(0, 50)}`);
        continue;
      }

      deposits.push({
        depositDate,
        salaryMonth,
        amount,
        employer,
        rawText: line.trim(),
      });
    } catch (e) {
      errors.push(`Error parsing line: ${line.substring(0, 50)}: ${e}`);
    }
  }

  return { deposits, errors };
}

/**
 * Parse a Meitav pension PDF and extract deposit data
 */
export async function parseMeitavPdf(buffer: Buffer): Promise<ParseResult> {
  const result: ParseResult = {
    success: false,
    deposits: [],
    errors: [],
    warnings: [],
    providerName: null,
    reportDate: null,
    memberName: null,
  };

  try {
    // Parse PDF to text
    const pdfParse = await getPdfParser();
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    // Extract metadata
    result.providerName = extractProviderName(text);
    result.reportDate = extractReportDate(text);
    result.memberName = extractMemberName(text);

    // Verify this is a Meitav PDF
    if (result.providerName !== 'Meitav') {
      result.errors.push('This does not appear to be a Meitav pension report');
      return result;
    }

    // Parse deposits
    const parseResult = parseDepositsTable(text);
    result.deposits = parseResult.deposits;
    result.errors.push(...parseResult.errors);

    // Sort deposits by salary month (newest first)
    result.deposits.sort((a, b) => b.salaryMonth.getTime() - a.salaryMonth.getTime());

    // Mark success if we found deposits
    result.success = result.deposits.length > 0;

    if (!result.success && result.errors.length === 0) {
      result.errors.push('No deposits found in the PDF');
    }
  } catch (error) {
    result.errors.push(
      `Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return result;
}

/**
 * Get the raw text from a PDF for debugging
 */
export async function getPdfRawText(buffer: Buffer): Promise<string> {
  const pdfParse = await getPdfParser();
  const pdfData = await pdfParse(buffer);
  return pdfData.text;
}
