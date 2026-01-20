/**
 * Unit tests for Meitav PDF parser
 * Tests date parsing, amount parsing, and deposit extraction from PDF text
 */

// Mock pdf-parse before importing the parser
jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation(() => Promise.resolve({ text: '' }));
});

import { parseMeitavPdf, getPdfRawText } from '../meitav-parser';

// Get the mocked pdf-parse
const mockPdfParse = jest.requireMock('pdf-parse');

describe('Meitav PDF Parser', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('parseMeitavPdf', () => {
    it('should return error when PDF is not from Meitav', async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: 'Some random PDF content without Meitav identifier',
      });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(false);
      expect(result.providerName).toBeNull();
      expect(result.errors).toContain('This does not appear to be a Meitav pension report');
    });

    it('should identify Meitav provider from PDF text', async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: 'חברת מיטב דש גמל ופנסיה\nתאריך הדוח: 01.01.2025',
      });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.providerName).toBe('Meitav');
    });

    it('should extract report date from PDF text', async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: 'מיטב דש\nתאריך הדוח: 15.06.2024\nפרטים נוספים',
      });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.reportDate).toBeDefined();
      expect(result.reportDate?.getFullYear()).toBe(2024);
      expect(result.reportDate?.getMonth()).toBe(5); // June is month 5 (0-indexed)
      expect(result.reportDate?.getDate()).toBe(15);
    });

    it('should handle missing report date gracefully', async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: 'מיטב דש\nNo date here\n',
      });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.reportDate).toBeNull();
    });

    it('should parse deposit rows correctly', async () => {
      // Simulated text from a Meitav PDF with deposit data
      // Format: amounts followed by salary month (MM/YYYY) and deposit date (DD/MM/YYYY) and employer
      const pdfText = `
מיטב דש גמל ופנסיה
תאריך הדוח: 01.01.2025

3,15512/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits.length).toBeGreaterThanOrEqual(1);

      const deposit = result.deposits[0];
      expect(deposit.amount).toBe(3155);
      expect(deposit.employer).toContain('בע"מ');
    });

    it('should skip header and summary rows', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

שם המעסיק מועד הפקדה
סה"כ הפקדות: 10,000
3,15512/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      // Should only have the actual deposit row, not headers/summaries
      expect(result.deposits.length).toBe(1);
    });

    it('should sort deposits by salary month descending (newest first)', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.03.2025

2,00010/202401/11/2024חברה א בע"מ
3,00012/202402/01/2025חברה א בע"מ
2,50011/202401/12/2024חברה א בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits.length).toBe(3);

      // Should be sorted: Dec 2024, Nov 2024, Oct 2024
      expect(result.deposits[0].salaryMonth.getMonth()).toBe(11); // December
      expect(result.deposits[1].salaryMonth.getMonth()).toBe(10); // November
      expect(result.deposits[2].salaryMonth.getMonth()).toBe(9); // October
    });

    it('should return error when no deposits found', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025
No actual deposit data here
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(false);
      expect(result.deposits).toHaveLength(0);
      expect(result.errors).toContain('No deposits found in the PDF');
    });

    it('should handle PDF parsing errors gracefully', async () => {
      mockPdfParse.mockRejectedValueOnce(new Error('PDF is encrypted'));

      const buffer = Buffer.from('encrypted pdf');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Failed to parse PDF'))).toBe(true);
    });

    it('should reject amounts outside valid range (0-50000)', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

60,00012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      // Amount 60,000 exceeds 50,000 limit, should be rejected
      expect(result.deposits.length).toBe(0);
      expect(result.errors.some((e) => e.includes('Invalid amount'))).toBe(true);
    });
  });

  describe('Date Parsing (via parseMeitavPdf)', () => {
    it('should parse DD/MM/YYYY deposit date format correctly', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00012/202425/12/2024חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      const deposit = result.deposits[0];

      // Deposit date should be December 25, 2024
      expect(deposit.depositDate.getUTCFullYear()).toBe(2024);
      expect(deposit.depositDate.getUTCMonth()).toBe(11); // December
      expect(deposit.depositDate.getUTCDate()).toBe(25);
    });

    it('should parse MM/YYYY salary month format correctly', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00011/202401/12/2024חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      const deposit = result.deposits[0];

      // Salary month should be November 2024 (first of month)
      expect(deposit.salaryMonth.getUTCFullYear()).toBe(2024);
      expect(deposit.salaryMonth.getUTCMonth()).toBe(10); // November
      expect(deposit.salaryMonth.getUTCDate()).toBe(1); // First of month
    });

    it('should use UTC to avoid timezone issues', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00001/202402/02/2024חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      const deposit = result.deposits[0];

      // The dates should be stored in UTC
      expect(deposit.salaryMonth.toISOString()).toContain('2024-01-01');
      expect(deposit.depositDate.toISOString()).toContain('2024-02-02');
    });
  });

  describe('Amount Parsing (via parseMeitavPdf)', () => {
    it('should parse amounts with comma separators', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

5,50012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits[0].amount).toBe(5500);
    });

    it('should parse amounts without comma separators', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

50012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits[0].amount).toBe(500);
    });

    it('should handle amounts with multiple comma separators', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

10,50012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits[0].amount).toBe(10500);
    });
  });

  describe('Employer Name Extraction', () => {
    it('should extract Hebrew employer name ending with "Ltd" in Hebrew', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00012/202402/01/2025וויאנטיס בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits[0].employer).toContain('בע"מ');
    });

    it('should handle alternative Hebrew quotation marks for Ltd', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00012/202402/01/2025חברה ישראלית בע״מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf content');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits[0].employer).toContain('בע״מ');
    });
  });

  describe('getPdfRawText', () => {
    it('should return raw text from PDF', async () => {
      const expectedText = 'This is the raw PDF text content';
      mockPdfParse.mockResolvedValueOnce({ text: expectedText });

      const buffer = Buffer.from('fake pdf');
      const rawText = await getPdfRawText(buffer);

      expect(rawText).toBe(expectedText);
    });

    it('should handle empty PDF', async () => {
      mockPdfParse.mockResolvedValueOnce({ text: '' });

      const buffer = Buffer.from('empty pdf');
      const rawText = await getPdfRawText(buffer);

      expect(rawText).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle PDF with only whitespace', async () => {
      mockPdfParse.mockResolvedValueOnce({ text: '   \n\n\t  ' });

      const buffer = Buffer.from('whitespace pdf');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('This does not appear to be a Meitav pension report');
    });

    it('should handle malformed deposit rows gracefully', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

incomplete row data בע"מ
3,00012/202402/01/2025חברה בע"מ
another broken line 02/01/2025
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      // Should still parse the valid deposit row
      expect(result.deposits.length).toBeGreaterThanOrEqual(1);
      expect(result.deposits[0].amount).toBe(3000);
    });

    it('should store raw text in deposit for debugging', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(true);
      expect(result.deposits[0].rawText).toBeDefined();
      expect(result.deposits[0].rawText).toContain('בע"מ');
    });

    it('should handle row with deposit date but missing salary month', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00002/01/2025חברה בע"מ
`;
      // This row has a deposit date (02/01/2025) but no salary month (MM/YYYY)

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      // Should not parse this row since salary month is missing
      expect(result.deposits.length).toBe(0);
    });

    it('should handle row with invalid deposit date format', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00012/2024xx/yy/zzzzחברה בע"מ
`;
      // xx/yy/zzzz is not a valid date pattern - won't match the regex

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      // Row doesn't have a valid deposit date pattern, should not be parsed
      expect(result.deposits.length).toBe(0);
    });

    it('should use fallback salary month parsing when combined pattern fails', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,000 12/2024 02/01/2025חברה בע"מ
`;
      // Space separated pattern

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      // Should attempt fallback parsing
      expect(result.providerName).toBe('Meitav');
    });

    it('should handle non-Error exceptions in PDF parsing', async () => {
      mockPdfParse.mockRejectedValueOnce('String error');

      const buffer = Buffer.from('bad pdf');
      const result = await parseMeitavPdf(buffer);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Unknown error'))).toBe(true);
    });

    it('should skip lines with header text like "מועד"', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

מועד הפקדה 12/202402/01/2025בע"מ
3,00012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      // Should skip the header row
      expect(result.deposits.length).toBe(1);
    });

    it('should handle zero amount as invalid', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      expect(result.deposits.length).toBe(0);
    });

    it('should handle member name extraction', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025
שם העמית: ישראל ישראלי מספר

3,00012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      expect(result.memberName).toBe('ישראל ישראלי');
    });

    it('should handle missing member name', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00012/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      expect(result.memberName).toBeNull();
    });

    it('should set employer to Unknown when not found', async () => {
      // Create a row that has dates and numbers but no Hebrew company name pattern
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

3,00012/202402/01/2025ABC Corp בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      // Should have parsed the deposit
      expect(result.providerName).toBe('Meitav');
    });

    it('should handle line with no amounts before salary month', async () => {
      const pdfText = `
מיטב דש
תאריך הדוח: 01.01.2025

12/202402/01/2025חברה בע"מ
`;

      mockPdfParse.mockResolvedValueOnce({ text: pdfText });

      const buffer = Buffer.from('fake pdf');
      const result = await parseMeitavPdf(buffer);

      // Should fail to parse - no amounts
      expect(result.errors.some((e) => e.includes('Could not extract amounts'))).toBe(true);
    });
  });
});
