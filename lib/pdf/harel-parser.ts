import { ParsedDeposit, ParseResult, AccountSummary } from './types';

/**
 * Parse a date string in DD/MM/YYYY format
 * Returns a Date at UTC midnight to avoid timezone issues
 */
function parseDate(text: string): Date | null {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Parse a salary month string in MM/YYYY format to first of month
 */
function parseSalaryMonth(text: string): Date | null {
  const match = text.match(/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, month, year] = match;
  const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Parse a number with comma separators (e.g., "59,000" -> 59000)
 */
function parseNumber(text: string): number {
  const cleaned = text.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Extract the report date from Harel PDF text
 * Format: "DD/MM/YYYY :תאריך הדוח" (RTL - date appears before label in extracted text)
 */
function extractReportDate(text: string): Date | null {
  // Pattern: date followed by :תאריך הדוח
  const match = text.match(/(\d{2}\/\d{2}\/\d{4})\s*:תאריך הדוח/);
  if (match) return parseDate(match[1]);

  // Fallback: תאריך הדוח: followed by date
  const fallback = text.match(/תאריך הדוח[:\s]+(\d{2}\/\d{2}\/\d{4})/);
  if (fallback) return parseDate(fallback[1]);

  return null;
}

/**
 * Extract member name from Harel PDF text
 * Raw text format: "305392656 :מספר ת.ז. עמיחי רון  אופנבכר : שם"
 */
function extractMemberName(text: string): string | null {
  // Pattern: Hebrew name between ת.ז. and : שם
  const match = text.match(/ת\.ז\.\s+([א-ת][א-ת\s]+?)\s*:\s*שם/);
  if (match) return match[1].trim();

  // Fallback: look for שם העמית pattern (used in some Harel reports)
  const fallback = text.match(/שם העמית[:\s]+([א-ת\s]+?)(?:\s+מספר|$)/m);
  if (fallback) return fallback[1].trim();

  return null;
}

/**
 * Extract account number from Harel PDF text
 * Pattern: "172365048מספר חשבון:" (RTL - number appears before label in extracted text)
 */
function extractAccountNumber(text: string): string | null {
  // Pattern: digits followed by מספר חשבון
  const match = text.match(/(\d+)\s*מספר חשבון/);
  if (match) return match[1];

  // Fallback: מספר חשבון followed by digits
  const fallback = text.match(/מספר חשבון[:\s]+(\d+)/);
  if (fallback) return fallback[1];

  return null;
}

/**
 * Extract the closing balance (current value) from Harel PDF text
 * Look for the balance at end of reporting period
 */
function extractCurrentValue(text: string): number | null {
  // Pattern: number followed by "יתרת הכספים בחשבון בסוף"
  const match = text.match(/([\d,]+)\s*יתרת הכספים בחשבון בסוף/);
  if (match) return parseNumber(match[1]);

  // Fallback: look for number near "יתרה לתאריך הדוח"
  const fallback = text.match(/([\d,]+)\s*יתרה לתאריך הדוח/);
  if (fallback) return parseNumber(fallback[1]);

  return null;
}

/**
 * Extract management fee percentage from total savings
 * Pattern: "0.55%דמי ניהול מחיסכון"
 */
function extractFeeFromTotal(text: string): number | null {
  // Pattern: percentage followed by "דמי ניהול מחיסכון"
  const match = text.match(/([\d.]+)%\s*דמי ניהול מחיסכון/);
  if (match) return parseFloat(match[1]);

  // Fallback with colon separator
  const fallback = text.match(/דמי ניהול מחיסכון[:\s]+([\d.]+)%/);
  if (fallback) return parseFloat(fallback[1]);

  return null;
}

/**
 * Extract investment track name and return percentage
 * Pattern: "0.67%3.32%P 500&S עוקב מדד"
 */
function extractInvestmentTrack(text: string): {
  track: string | null;
  trackReturn: number | null;
} {
  // Pattern: percentages followed by track name in Hebrew
  // The text shows: "0.67%3.32%P 500&S עוקב מדד"
  // We want the track name and the first percentage (return), not the second (cost)
  const match = text.match(/([\d.]+)%([\d.]+)%(.+?)(?:\n|$)/);
  if (match) {
    const costPercent = parseFloat(match[1]);
    const returnPercent = parseFloat(match[2]);
    const trackName = match[3].trim();

    // RTL extraction order: cost% | return% | track name
    // match[1] = cost (e.g. 0.67), match[2] = return (e.g. 3.32)

    // Clean up S&P formatting (extracted as "P 500&S" due to RTL)
    let cleanTrackName = trackName;
    if (cleanTrackName.includes('P 500&S') || cleanTrackName.includes('S&P')) {
      cleanTrackName = cleanTrackName.replace('P 500&S', 'S&P 500').replace('עוקב מדד', '').trim();
      if (!cleanTrackName) cleanTrackName = 'S&P 500';
    }

    return {
      track: cleanTrackName || null,
      trackReturn: returnPercent,
    };
  }

  return { track: null, trackReturn: null };
}

/**
 * Check if the PDF indicates no deposits were made
 */
function hasNoDeposits(text: string): boolean {
  return text.includes('לא היו הפקדות שוטפות');
}

/**
 * Parse deposits table from Harel PDF if present
 * Harel deposit columns: deposit date, salary month, salary, employee, employer, total
 */
function parseDepositsTable(text: string): {
  deposits: ParsedDeposit[];
  errors: string[];
} {
  const deposits: ParsedDeposit[] = [];
  const errors: string[] = [];

  if (hasNoDeposits(text)) {
    return { deposits, errors };
  }

  const lines = text.split('\n');

  for (const line of lines) {
    // Look for lines with deposit date pattern and amounts
    const hasDepositDate = /\d{2}\/\d{2}\/\d{4}/.test(line);
    const hasSalaryMonth = /\d{2}\/\d{4}/.test(line);

    if (!hasDepositDate || !hasSalaryMonth) continue;

    // Skip header/summary rows
    if (
      line.includes('מועד') ||
      line.includes('סה"כ') ||
      line.includes('תאריך הדוח') ||
      line.includes('הרבעון') ||
      line.includes('מתאריך')
    ) {
      continue;
    }

    try {
      const depositDateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (!depositDateMatch) continue;
      const depositDate = parseDate(depositDateMatch[1]);
      if (!depositDate) continue;

      // Extract salary month (MM/YYYY not part of DD/MM/YYYY)
      const salaryMonthPattern = /(\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})/;
      const combinedMatch = line.match(salaryMonthPattern);

      let salaryMonth: Date | null = null;
      if (combinedMatch) {
        salaryMonth = parseSalaryMonth(combinedMatch[1]);
      } else {
        const parts = line.split(/\d{2}\/\d{2}\/\d{4}/);
        if (parts[0]) {
          const monthMatch = parts[0].match(/(\d{2}\/\d{4})/);
          if (monthMatch) {
            salaryMonth = parseSalaryMonth(monthMatch[1]);
          }
        }
      }

      if (!salaryMonth) continue;

      // Extract total amount
      const amountPattern = /(\d{1,3}(?:,\d{3})*)/g;
      const salaryMonthStr = `${String(salaryMonth.getMonth() + 1).padStart(2, '0')}/${salaryMonth.getFullYear()}`;
      const beforeSalaryMonth = line.split(salaryMonthStr)[0];
      const amounts = beforeSalaryMonth?.match(amountPattern);

      if (!amounts || amounts.length < 1) {
        errors.push(`Could not extract amounts from: ${line.substring(0, 50)}`);
        continue;
      }

      const amount = parseNumber(amounts[0]);
      if (Math.abs(amount) > 50000 || amount === 0) continue;

      // Extract employer name
      const employerMatch = line.match(/([א-ת][א-ת\s'"״]+(?:בע"מ|בע״מ|כללי))/);
      const employer = employerMatch ? employerMatch[1].trim() : 'Unknown';

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
 * Parse a Harel pension/hishtalmut PDF from pre-extracted text
 */
export function parseHarelPdf(text: string): ParseResult {
  const result: ParseResult = {
    success: false,
    deposits: [],
    errors: [],
    warnings: [],
    providerName: null,
    reportDate: null,
    memberName: null,
    accountNumber: null,
  };

  try {
    // Verify this is a Harel PDF
    if (!text.includes('הראל')) {
      result.errors.push('This does not appear to be a Harel report');
      return result;
    }

    result.providerName = 'Harel';
    result.reportDate = extractReportDate(text);
    result.memberName = extractMemberName(text);
    result.accountNumber = extractAccountNumber(text);

    // Extract account summary
    const currentValue = extractCurrentValue(text);
    const feeFromTotal = extractFeeFromTotal(text);
    const { track, trackReturn } = extractInvestmentTrack(text);

    const accountSummary: AccountSummary = {
      currentValue,
      feeFromTotal,
      investmentTrack: track,
      trackReturn,
    };

    result.accountSummary = accountSummary;

    // Parse deposits
    const parseDepositsResult = parseDepositsTable(text);
    result.deposits = parseDepositsResult.deposits;
    result.errors.push(...parseDepositsResult.errors);

    // Sort deposits by salary month (newest first)
    result.deposits.sort((a, b) => b.salaryMonth.getTime() - a.salaryMonth.getTime());

    // Mark success if we have account summary or deposits
    result.success = currentValue !== null || result.deposits.length > 0;

    if (!result.success) {
      result.errors.push('Could not extract account data from the PDF');
    }

    if (result.deposits.length === 0 && hasNoDeposits(text)) {
      result.warnings.push('No deposits found in the reporting period');
    }
  } catch (error) {
    result.errors.push(
      `Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return result;
}
