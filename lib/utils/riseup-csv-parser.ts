/**
 * Client-side parser for Riseup CSV transaction exports.
 *
 * Riseup CSV format (Hebrew headers, UTF-8 with BOM):
 * שייך לתזרים חודש, שם העסק, אמצעי התשלום, אמצעי זיהוי התשלום,
 * תאריך התשלום, חודש תאריך התשלום, שנת תאריך התשלום, תאריך החיוב בחשבון,
 * סכום, מטבע חיוב, מספר התשלום, מספר תשלומים כולל, קטגוריה בתזרים,
 * האם מוחרג מהתזרים?, הערות, סוג מקור, סכום מקורי
 */

export interface ParsedRiseupTransaction {
  type: 'income' | 'expense';
  transactionDate: string; // YYYY-MM-DD
  paymentDate: string | null; // YYYY-MM-DD
  amountIls: number; // absolute value
  currency: string;
  amountOriginal: number; // absolute value of original amount
  payeeName: string;
  riseupCategory: string | null;
  paymentMethod: 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'other';
  paymentNumber: number | null;
  totalPayments: number | null;
  source: 'bank_import' | 'credit_card_import';
  paymentIdentifier: string | null;
  excludedFromFlow: boolean;
  notes: string | null;
  flowMonth: string | null; // YYYY-MM from the first column
}

export interface ParseResult {
  transactions: ParsedRiseupTransaction[];
  errors: string[];
}

// Hebrew header → field mapping
const HEADER_MAP: Record<string, string> = {
  'שייך לתזרים חודש': 'flowMonth',
  'שם העסק': 'payeeName',
  'אמצעי התשלום': 'paymentMethod',
  'אמצעי זיהוי התשלום': 'paymentIdentifier',
  'תאריך התשלום': 'transactionDate',
  'חודש תאריך התשלום': 'transactionMonth',
  'שנת תאריך התשלום': 'transactionYear',
  'תאריך החיוב בחשבון': 'paymentDate',
  סכום: 'amount',
  'מטבע חיוב': 'chargeCurrency',
  'מספר התשלום': 'paymentNumber',
  'מספר תשלומים כולל': 'totalPayments',
  'קטגוריה בתזרים': 'riseupCategory',
  'האם מוחרג מהתזרים?': 'excludedFromFlow',
  הערות: 'notes',
  'סוג מקור': 'sourceType',
  'סכום מקורי': 'originalAmount',
};

/**
 * Mapping from Riseup Hebrew category names to app English category names.
 * Used both in the CSV parser (to enrich parsed data) and on the server
 * (as a fallback when direct name matching fails).
 */
export const RISEUP_CATEGORY_MAP: Record<string, string> = {
  // → Groceries
  סופר: 'Groceries',
  מכולת: 'Groceries',

  // → Utilities
  חשמל: 'Utilities',
  מים: 'Utilities',
  גז: 'Utilities',
  ארנונה: 'Utilities',

  // → Transportation
  דלק: 'Transportation',
  רכב: 'Transportation',
  'תחבצ כביש 6 מוניות וחניה': 'Transportation',

  // → Health & Medical
  פארמה: 'Health & Medical',

  // → Dining Out
  'אוכל בחוץ': 'Dining Out',

  // → Entertainment
  פנאי: 'Entertainment',

  // → Shopping
  'ביגוד והנעלה': 'Shopping',
  כללי: 'Shopping',

  // → Subscriptions
  דיגיטל: 'Subscriptions',
  תקשורת: 'Subscriptions',

  // → Investments
  'חסכון קבוע': 'Investments',
  'חסכון חד פעמי': 'Investments',

  // Categories that map to Insurance (may not exist in app yet)
  ביטוח: 'Insurance',

  // Categories that map to Education (may not exist in app yet)
  חינוך: 'Education',

  // Categories that map to Housing (may not exist in app yet)
  דיור: 'Housing',

  // Categories we intentionally skip mapping (user-specific or meta):
  // הכנסות קבועות, הכנסות משתנות, הוצאות לא תזרימיות, הכנסות לא תזרימיות,
  // תשלומים, העברות, עמלות, תקציב הודיה, תקציב עמיחי, RiseUp, etc.
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseDateDDMMYYYY(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function mapPaymentMethod(
  method: string
): 'cash' | 'credit_card' | 'bank_transfer' | 'check' | 'other' {
  switch (method.toLowerCase()) {
    case 'leumicard':
    case 'visa':
    case 'mastercard':
    case 'isracard':
    case 'amex':
    case 'diners':
    case 'max':
      return 'credit_card';
    case 'benleumi':
    case 'onezero':
    case 'bank':
      return 'bank_transfer';
    default:
      return 'other';
  }
}

function mapSource(sourceType: string): 'bank_import' | 'credit_card_import' {
  switch (sourceType.toLowerCase()) {
    case 'creditcard':
      return 'credit_card_import';
    case 'checkingaccount':
    default:
      return 'bank_import';
  }
}

export function parseRiseupCSV(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedRiseupTransaction[] = [];

  const text = stripBom(csvText);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    return { transactions: [], errors: ['CSV file is empty or has no data rows'] };
  }

  // Parse header
  const headerFields = parseCSVLine(lines[0]);
  const fieldIndices: Record<string, number> = {};

  for (let i = 0; i < headerFields.length; i++) {
    const mapped = HEADER_MAP[headerFields[i]];
    if (mapped) {
      fieldIndices[mapped] = i;
    }
  }

  // Verify required headers exist
  const required = ['payeeName', 'transactionDate', 'amount'];
  for (const req of required) {
    if (fieldIndices[req] === undefined) {
      errors.push(`Missing required header for field: ${req}`);
    }
  }
  if (errors.length > 0) {
    return { transactions: [], errors };
  }

  // Parse data rows
  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const fields = parseCSVLine(lines[rowIdx]);
    const get = (key: string): string => fields[fieldIndices[key]] ?? '';

    const payeeName = get('payeeName').trim();
    if (!payeeName) {
      errors.push(`Row ${rowIdx + 1}: Missing payee name`);
      continue;
    }

    const transactionDateStr = get('transactionDate');
    const transactionDate = parseDateDDMMYYYY(transactionDateStr);
    if (!transactionDate) {
      errors.push(`Row ${rowIdx + 1}: Invalid transaction date "${transactionDateStr}"`);
      continue;
    }

    const amountStr = get('amount');
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
      errors.push(`Row ${rowIdx + 1}: Invalid amount "${amountStr}"`);
      continue;
    }

    const originalAmountStr = get('originalAmount');
    const parsedOriginal = originalAmountStr ? parseFloat(originalAmountStr) : 0;
    const originalAmount = isNaN(parsedOriginal) ? 0 : parsedOriginal;

    const paymentDateStr = get('paymentDate');
    const paymentDate = parseDateDDMMYYYY(paymentDateStr);

    const paymentMethodRaw = get('paymentMethod');
    const paymentMethod = mapPaymentMethod(paymentMethodRaw);

    const sourceType = get('sourceType');
    const source = mapSource(sourceType);

    const paymentNumberStr = get('paymentNumber');
    const paymentNumber = paymentNumberStr ? parseInt(paymentNumberStr, 10) : null;
    const totalPaymentsStr = get('totalPayments');
    const totalPayments = totalPaymentsStr ? parseInt(totalPaymentsStr, 10) : null;

    const riseupCategory = get('riseupCategory') || null;
    const excludedStr = get('excludedFromFlow');
    const excludedFromFlow = excludedStr === 'true';
    const notes = get('notes') || null;
    const paymentIdentifier = get('paymentIdentifier') || null;
    const flowMonth = get('flowMonth') || null;
    const chargeCurrency = get('chargeCurrency') || 'ILS';

    // Determine type from amount sign: negative = expense, positive = income
    const type: 'income' | 'expense' = amount < 0 ? 'expense' : 'income';

    // Use absolute values
    // `amount` (סכום) is the ILS charge amount
    // `originalAmount` (סכום מקורי) is in the original currency (chargeCurrency)
    const absAmount = Math.abs(amount);
    const absOriginal = originalAmount !== 0 ? Math.abs(originalAmount) : absAmount;

    // Round to 2 decimal places
    const amountIls = Math.round(absAmount * 100) / 100;
    const amountOriginalRounded = Math.round(absOriginal * 100) / 100;

    transactions.push({
      type,
      transactionDate,
      paymentDate,
      amountIls,
      currency: chargeCurrency,
      amountOriginal: amountOriginalRounded,
      payeeName,
      riseupCategory,
      paymentMethod,
      paymentNumber: paymentNumber && !isNaN(paymentNumber) ? paymentNumber : null,
      totalPayments: totalPayments && !isNaN(totalPayments) ? totalPayments : null,
      source,
      paymentIdentifier,
      excludedFromFlow,
      notes,
      flowMonth,
    });
  }

  return { transactions, errors };
}

/**
 * Generate a duplicate key for a transaction.
 * Used to detect duplicates: same date + payee name (lowercased) + amount.
 */
export function getDuplicateKey(tx: {
  transactionDate: string;
  payeeName: string;
  amountIls: number;
}): string {
  return `${tx.transactionDate}|${tx.payeeName.toLowerCase().trim()}|${tx.amountIls}`;
}
