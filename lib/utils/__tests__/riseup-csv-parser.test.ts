/**
 * Unit tests for Riseup CSV parser
 * Tests CSV parsing, date conversion, payment method mapping, source mapping,
 * amount sign handling, installment parsing, and duplicate key generation.
 */

import {
  parseRiseupCSV,
  getDuplicateKey,
  type ParsedRiseupTransaction,
  type ParseResult,
} from '../riseup-csv-parser';

// ---------------------------------------------------------------------------
// Helper: build a CSV string from header + data rows
// ---------------------------------------------------------------------------
const HEBREW_HEADERS = [
  'שייך לתזרים חודש',
  'שם העסק',
  'אמצעי התשלום',
  'אמצעי זיהוי התשלום',
  'תאריך התשלום',
  'חודש תאריך התשלום',
  'שנת תאריך התשלום',
  'תאריך החיוב בחשבון',
  'סכום',
  'מטבע חיוב',
  'מספר התשלום',
  'מספר תשלומים כולל',
  'קטגוריה בתזרים',
  'האם מוחרג מהתזרים?',
  'הערות',
  'סוג מקור',
  'סכום מקורי',
].join(',');

function buildCSV(rows: string[], headers: string = HEBREW_HEADERS): string {
  return [headers, ...rows].join('\n');
}

function makeRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    flowMonth: '2024-06',
    payeeName: 'Super Pharm',
    paymentMethod: 'leumicard',
    paymentIdentifier: '1234',
    transactionDate: '15/06/2024',
    transactionMonth: '6',
    transactionYear: '2024',
    paymentDate: '01/07/2024',
    amount: '-150.50',
    chargeCurrency: 'ILS',
    paymentNumber: '2',
    totalPayments: '6',
    riseupCategory: 'Health',
    excludedFromFlow: 'false',
    notes: '',
    sourceType: 'creditCard',
    originalAmount: '-150.50',
  };

  const merged = { ...defaults, ...overrides };

  return [
    merged.flowMonth,
    merged.payeeName,
    merged.paymentMethod,
    merged.paymentIdentifier,
    merged.transactionDate,
    merged.transactionMonth,
    merged.transactionYear,
    merged.paymentDate,
    merged.amount,
    merged.chargeCurrency,
    merged.paymentNumber,
    merged.totalPayments,
    merged.riseupCategory,
    merged.excludedFromFlow,
    merged.notes,
    merged.sourceType,
    merged.originalAmount,
  ].join(',');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Riseup CSV Parser', () => {
  // =========================================================================
  // Basic parsing
  // =========================================================================
  describe('parseRiseupCSV - basic parsing', () => {
    it('should parse a single valid expense row with Hebrew headers', () => {
      const csv = buildCSV([makeRow()]);
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);

      const tx = result.transactions[0];
      expect(tx.type).toBe('expense');
      expect(tx.transactionDate).toBe('2024-06-15');
      expect(tx.paymentDate).toBe('2024-07-01');
      expect(tx.amountIls).toBe(150.5);
      expect(tx.currency).toBe('ILS');
      expect(tx.amountOriginal).toBe(150.5);
      expect(tx.payeeName).toBe('Super Pharm');
      expect(tx.riseupCategory).toBe('Health');
      expect(tx.paymentMethod).toBe('credit_card');
      expect(tx.paymentNumber).toBe(2);
      expect(tx.totalPayments).toBe(6);
      expect(tx.source).toBe('credit_card_import');
      expect(tx.paymentIdentifier).toBe('1234');
      expect(tx.excludedFromFlow).toBe(false);
      expect(tx.notes).toBeNull();
      expect(tx.flowMonth).toBe('2024-06');
    });

    it('should parse multiple rows', () => {
      const csv = buildCSV([
        makeRow({ payeeName: 'Store A', amount: '-100' }),
        makeRow({ payeeName: 'Store B', amount: '-200' }),
        makeRow({ payeeName: 'Salary', amount: '10000' }),
      ]);
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].payeeName).toBe('Store A');
      expect(result.transactions[1].payeeName).toBe('Store B');
      expect(result.transactions[2].payeeName).toBe('Salary');
    });

    it('should handle Windows-style CRLF line endings', () => {
      const csv = [HEBREW_HEADERS, makeRow()].join('\r\n');
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
    });

    it('should skip blank lines in CSV', () => {
      const csv = [HEBREW_HEADERS, '', makeRow(), '', '  ', makeRow()].join('\n');
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(2);
    });
  });

  // =========================================================================
  // BOM stripping
  // =========================================================================
  describe('BOM handling', () => {
    it('should strip UTF-8 BOM from the beginning of the file', () => {
      const bom = '\uFEFF';
      const csv = bom + buildCSV([makeRow()]);
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].payeeName).toBe('Super Pharm');
    });

    it('should work when there is no BOM', () => {
      const csv = buildCSV([makeRow()]);
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
    });
  });

  // =========================================================================
  // Date format conversion
  // =========================================================================
  describe('date format conversion (DD/MM/YYYY to YYYY-MM-DD)', () => {
    it('should convert DD/MM/YYYY to YYYY-MM-DD', () => {
      const csv = buildCSV([makeRow({ transactionDate: '25/12/2023' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].transactionDate).toBe('2023-12-25');
    });

    it('should convert payment date', () => {
      const csv = buildCSV([makeRow({ paymentDate: '03/01/2024' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].paymentDate).toBe('2024-01-03');
    });

    it('should set paymentDate to null when empty', () => {
      const csv = buildCSV([makeRow({ paymentDate: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].paymentDate).toBeNull();
    });

    it('should handle single-digit day and month zero-padded', () => {
      const csv = buildCSV([makeRow({ transactionDate: '01/02/2024' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].transactionDate).toBe('2024-02-01');
    });
  });

  // =========================================================================
  // Payment method mapping
  // =========================================================================
  describe('payment method mapping', () => {
    const creditCardMethods = [
      'leumicard',
      'visa',
      'mastercard',
      'isracard',
      'amex',
      'diners',
      'max',
    ];
    const bankTransferMethods = ['benleumi', 'onezero', 'bank'];

    it.each(creditCardMethods)('should map "%s" to "credit_card"', (method) => {
      const csv = buildCSV([makeRow({ paymentMethod: method })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].paymentMethod).toBe('credit_card');
    });

    it.each(bankTransferMethods)('should map "%s" to "bank_transfer"', (method) => {
      const csv = buildCSV([makeRow({ paymentMethod: method })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].paymentMethod).toBe('bank_transfer');
    });

    it('should map unknown payment methods to "other"', () => {
      const csv = buildCSV([makeRow({ paymentMethod: 'bitcoin' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].paymentMethod).toBe('other');
    });

    it('should map empty payment method to "other"', () => {
      const csv = buildCSV([makeRow({ paymentMethod: '' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].paymentMethod).toBe('other');
    });

    it('should be case-insensitive for payment methods', () => {
      const csv = buildCSV([makeRow({ paymentMethod: 'LeumiCard' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].paymentMethod).toBe('credit_card');
    });
  });

  // =========================================================================
  // Source mapping
  // =========================================================================
  describe('source mapping', () => {
    it('should map "creditCard" to "credit_card_import"', () => {
      const csv = buildCSV([makeRow({ sourceType: 'creditCard' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].source).toBe('credit_card_import');
    });

    it('should map "checkingAccount" to "bank_import"', () => {
      const csv = buildCSV([makeRow({ sourceType: 'checkingAccount' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].source).toBe('bank_import');
    });

    it('should default unknown source types to "bank_import"', () => {
      const csv = buildCSV([makeRow({ sourceType: 'savings' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].source).toBe('bank_import');
    });

    it('should default empty source type to "bank_import"', () => {
      const csv = buildCSV([makeRow({ sourceType: '' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].source).toBe('bank_import');
    });

    it('should be case-insensitive for source types', () => {
      const csv = buildCSV([makeRow({ sourceType: 'CreditCard' })]);
      const result = parseRiseupCSV(csv);
      expect(result.transactions[0].source).toBe('credit_card_import');
    });
  });

  // =========================================================================
  // Amount sign and type determination
  // =========================================================================
  describe('amount sign and type determination', () => {
    it('should map negative amounts to expense type with absolute value', () => {
      const csv = buildCSV([makeRow({ amount: '-250.75', originalAmount: '-250.75' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[0].amountIls).toBe(250.75);
      expect(result.transactions[0].amountOriginal).toBe(250.75);
    });

    it('should map positive amounts to income type', () => {
      const csv = buildCSV([makeRow({ amount: '5000', originalAmount: '5000' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].type).toBe('income');
      expect(result.transactions[0].amountIls).toBe(5000);
      expect(result.transactions[0].amountOriginal).toBe(5000);
    });

    it('should treat zero amount as income', () => {
      const csv = buildCSV([makeRow({ amount: '0', originalAmount: '0' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].type).toBe('income');
      expect(result.transactions[0].amountIls).toBe(0);
    });

    it('should round amounts to 2 decimal places', () => {
      const csv = buildCSV([makeRow({ amount: '-99.999', originalAmount: '-99.999' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].amountIls).toBe(100);
      expect(result.transactions[0].amountOriginal).toBe(100);
    });

    it('should handle very small amounts', () => {
      const csv = buildCSV([makeRow({ amount: '-0.01', originalAmount: '-0.01' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[0].amountIls).toBe(0.01);
    });

    it('should handle very large amounts', () => {
      const csv = buildCSV([makeRow({ amount: '-999999.99', originalAmount: '-999999.99' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].amountIls).toBe(999999.99);
    });

    it('should use amountIls as amountOriginal when originalAmount is empty', () => {
      const csv = buildCSV([makeRow({ amount: '-300', originalAmount: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].amountIls).toBe(300);
      expect(result.transactions[0].amountOriginal).toBe(300);
    });
  });

  // =========================================================================
  // Installment number parsing
  // =========================================================================
  describe('installment number parsing', () => {
    it('should parse payment number and total payments', () => {
      const csv = buildCSV([makeRow({ paymentNumber: '3', totalPayments: '12' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].paymentNumber).toBe(3);
      expect(result.transactions[0].totalPayments).toBe(12);
    });

    it('should set paymentNumber to null when empty', () => {
      const csv = buildCSV([makeRow({ paymentNumber: '', totalPayments: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].paymentNumber).toBeNull();
      expect(result.transactions[0].totalPayments).toBeNull();
    });

    it('should set NaN paymentNumber to null', () => {
      const csv = buildCSV([makeRow({ paymentNumber: 'abc', totalPayments: 'xyz' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].paymentNumber).toBeNull();
      expect(result.transactions[0].totalPayments).toBeNull();
    });

    it('should handle paymentNumber of 1 (single payment)', () => {
      const csv = buildCSV([makeRow({ paymentNumber: '1', totalPayments: '1' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].paymentNumber).toBe(1);
      expect(result.transactions[0].totalPayments).toBe(1);
    });
  });

  // =========================================================================
  // excludedFromFlow parsing
  // =========================================================================
  describe('excludedFromFlow parsing', () => {
    it('should parse "true" as true', () => {
      const csv = buildCSV([makeRow({ excludedFromFlow: 'true' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].excludedFromFlow).toBe(true);
    });

    it('should parse "false" as false', () => {
      const csv = buildCSV([makeRow({ excludedFromFlow: 'false' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].excludedFromFlow).toBe(false);
    });

    it('should parse empty string as false', () => {
      const csv = buildCSV([makeRow({ excludedFromFlow: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].excludedFromFlow).toBe(false);
    });

    it('should parse any non-"true" value as false', () => {
      const csv = buildCSV([makeRow({ excludedFromFlow: 'yes' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].excludedFromFlow).toBe(false);
    });
  });

  // =========================================================================
  // Optional fields
  // =========================================================================
  describe('optional fields', () => {
    it('should set riseupCategory to null when empty', () => {
      const csv = buildCSV([makeRow({ riseupCategory: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].riseupCategory).toBeNull();
    });

    it('should set notes to null when empty', () => {
      const csv = buildCSV([makeRow({ notes: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].notes).toBeNull();
    });

    it('should preserve notes when provided', () => {
      const csv = buildCSV([makeRow({ notes: 'Monthly subscription' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].notes).toBe('Monthly subscription');
    });

    it('should set paymentIdentifier to null when empty', () => {
      const csv = buildCSV([makeRow({ paymentIdentifier: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].paymentIdentifier).toBeNull();
    });

    it('should set flowMonth to null when empty', () => {
      const csv = buildCSV([makeRow({ flowMonth: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].flowMonth).toBeNull();
    });

    it('should set currency to ILS by default', () => {
      const csv = buildCSV([makeRow()]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions[0].currency).toBe('ILS');
    });
  });

  // =========================================================================
  // CSV quoting
  // =========================================================================
  describe('CSV quoting', () => {
    it('should handle quoted fields with commas', () => {
      const dataRow =
        '2024-06,"Store A, Inc.",leumicard,1234,15/06/2024,6,2024,01/07/2024,-100,ILS,,,Health,false,,creditCard,-100';
      const csv = HEBREW_HEADERS + '\n' + dataRow;
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].payeeName).toBe('Store A, Inc.');
    });

    it('should handle quoted fields with escaped double quotes', () => {
      const dataRow =
        '2024-06,"He said ""hello""",leumicard,1234,15/06/2024,6,2024,01/07/2024,-100,ILS,,,Health,false,,creditCard,-100';
      const csv = HEBREW_HEADERS + '\n' + dataRow;
      const result = parseRiseupCSV(csv);

      expect(result.errors).toHaveLength(0);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].payeeName).toBe('He said "hello"');
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe('error handling', () => {
    it('should report error for row with missing payee name', () => {
      const csv = buildCSV([makeRow({ payeeName: '' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Row 2');
      expect(result.errors[0]).toContain('Missing payee name');
    });

    it('should report error for row with invalid date', () => {
      const csv = buildCSV([makeRow({ transactionDate: 'not-a-date' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Row 2');
      expect(result.errors[0]).toContain('Invalid transaction date');
    });

    it('should report error for row with invalid amount', () => {
      const csv = buildCSV([makeRow({ amount: 'abc' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Row 2');
      expect(result.errors[0]).toContain('Invalid amount');
    });

    it('should continue parsing valid rows after error rows', () => {
      const csv = buildCSV([
        makeRow({ payeeName: '' }), // error: missing payee
        makeRow({ payeeName: 'Valid Store' }), // valid
        makeRow({ amount: 'bad' }), // error: bad amount
        makeRow({ payeeName: 'Another Store' }), // valid
      ]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions).toHaveLength(2);
      expect(result.errors).toHaveLength(2);
      expect(result.transactions[0].payeeName).toBe('Valid Store');
      expect(result.transactions[1].payeeName).toBe('Another Store');
    });

    it('should report error for date in wrong format (YYYY-MM-DD instead of DD/MM/YYYY)', () => {
      const csv = buildCSV([makeRow({ transactionDate: '2024-06-15' })]);
      const result = parseRiseupCSV(csv);

      expect(result.transactions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid transaction date');
    });
  });

  // =========================================================================
  // Empty CSV
  // =========================================================================
  describe('empty and minimal CSV', () => {
    it('should return error for empty string', () => {
      const result = parseRiseupCSV('');

      expect(result.transactions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('empty');
    });

    it('should return error for header-only CSV (no data rows)', () => {
      const csv = HEBREW_HEADERS;
      const result = parseRiseupCSV(csv);

      expect(result.transactions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('empty');
    });

    it('should return error for CSV with unrecognized headers', () => {
      const csv = buildCSV([makeRow()], 'col1,col2,col3');
      const result = parseRiseupCSV(csv);

      expect(result.transactions).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Missing required header');
    });
  });

  // =========================================================================
  // getDuplicateKey
  // =========================================================================
  describe('getDuplicateKey', () => {
    it('should produce a consistent key from date, payee, and amount', () => {
      const key = getDuplicateKey({
        transactionDate: '2024-06-15',
        payeeName: 'Super Pharm',
        amountIls: 150.5,
      });

      expect(key).toBe('2024-06-15|super pharm|150.5');
    });

    it('should lowercase the payee name', () => {
      const key = getDuplicateKey({
        transactionDate: '2024-01-01',
        payeeName: 'UPPER CASE Store',
        amountIls: 100,
      });

      expect(key).toBe('2024-01-01|upper case store|100');
    });

    it('should trim whitespace from payee name', () => {
      const key = getDuplicateKey({
        transactionDate: '2024-01-01',
        payeeName: '  spaced out  ',
        amountIls: 50,
      });

      expect(key).toBe('2024-01-01|spaced out|50');
    });

    it('should produce different keys for different dates', () => {
      const key1 = getDuplicateKey({
        transactionDate: '2024-06-15',
        payeeName: 'Store',
        amountIls: 100,
      });
      const key2 = getDuplicateKey({
        transactionDate: '2024-06-16',
        payeeName: 'Store',
        amountIls: 100,
      });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different amounts', () => {
      const key1 = getDuplicateKey({
        transactionDate: '2024-06-15',
        payeeName: 'Store',
        amountIls: 100,
      });
      const key2 = getDuplicateKey({
        transactionDate: '2024-06-15',
        payeeName: 'Store',
        amountIls: 200,
      });

      expect(key1).not.toBe(key2);
    });

    it('should produce different keys for different payees', () => {
      const key1 = getDuplicateKey({
        transactionDate: '2024-06-15',
        payeeName: 'Store A',
        amountIls: 100,
      });
      const key2 = getDuplicateKey({
        transactionDate: '2024-06-15',
        payeeName: 'Store B',
        amountIls: 100,
      });

      expect(key1).not.toBe(key2);
    });

    it('should produce identical keys for duplicate transactions', () => {
      const tx = {
        transactionDate: '2024-06-15',
        payeeName: 'Super Pharm',
        amountIls: 150.5,
      };

      expect(getDuplicateKey(tx)).toBe(getDuplicateKey(tx));
    });
  });

  // =========================================================================
  // Integration-style: full parse and duplicate detection workflow
  // =========================================================================
  describe('full workflow: parse then detect duplicates', () => {
    it('should detect duplicates across two parsed CSV files', () => {
      const csv1 = buildCSV([
        makeRow({ payeeName: 'Store A', amount: '-100', transactionDate: '01/06/2024' }),
        makeRow({ payeeName: 'Store B', amount: '-200', transactionDate: '02/06/2024' }),
      ]);
      const csv2 = buildCSV([
        makeRow({ payeeName: 'Store A', amount: '-100', transactionDate: '01/06/2024' }), // duplicate
        makeRow({ payeeName: 'Store C', amount: '-300', transactionDate: '03/06/2024' }), // new
      ]);

      const result1 = parseRiseupCSV(csv1);
      const result2 = parseRiseupCSV(csv2);

      const existingKeys = new Set(result1.transactions.map(getDuplicateKey));
      const newTransactions = result2.transactions.filter(
        (tx) => !existingKeys.has(getDuplicateKey(tx))
      );

      expect(newTransactions).toHaveLength(1);
      expect(newTransactions[0].payeeName).toBe('Store C');
    });
  });
});
