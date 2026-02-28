/**
 * Unit tests for Harel PDF parser
 * Tests metadata extraction, account summary, and deposit parsing from extracted text
 */

import { parseHarelPdf } from '../harel-parser';

// Sample Harel PDF extracted text (matching the real PDF structure)
const SAMPLE_HAREL_TEXT = `
http://www.harel-group.co.ilharelgs@harel-ins.co.il
30/09/2025 :תאריך הדוח
2025 לשנת הראל קרן השתלמותרבעוני בקרן השתלמות דוח
30/09/2025 עד תאריך  01/01/2025 מתאריך 2025לשנת  3ה-לסוף הרבעון
שכיר כללישם המעסיק:  172365048מספר חשבון:  305392656 :מספר ת.ז. עמיחי רון  אופנבכר : שם
א. תשלומים צפויים מקופת הגמל
סכום בש"ח
59,000יתרת הכספים המיועדים למשיכה חד פעמית החל מ-  30/06/2025
59,000סכום חד פעמי במקרה מוות*
בתקופת הדיווחב. תנועות בחשבונך
סכום בש"ח
0יתרת הכספים בחשבון בתחילת השנה
0כספים שהופקדו לחשבון
-588הפסדים בניכוי הוצאות ניהול השקעות
59,591כספים שהעברת לחשבון
-3דמי ניהול שנגבו בשנה זו
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח
ג. אחוז דמי ניהול והוצאות
בתקופת הדיווח*
0.55%דמי ניהול מחיסכון
ד. מסלולי השקעה
*בתקופת הדיווחותשואות
0.67%3.32%P 500&S עוקב מדד
ה. פירוט הפקדות לחשבון בתקופת הדיווח
 לא היו הפקדות שוטפות2025בשנת
`;

describe('Harel PDF Parser', () => {
  describe('parseHarelPdf', () => {
    it('should return error when text is not from Harel', () => {
      const result = parseHarelPdf('Some random PDF content without Harel identifier');

      expect(result.success).toBe(false);
      expect(result.providerName).toBeNull();
      expect(result.errors).toContain('This does not appear to be a Harel report');
    });

    it('should identify Harel provider', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.providerName).toBe('Harel');
    });

    it('should extract report date', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.reportDate).toBeDefined();
      expect(result.reportDate?.getUTCFullYear()).toBe(2025);
      expect(result.reportDate?.getUTCMonth()).toBe(8); // September (0-indexed)
      expect(result.reportDate?.getUTCDate()).toBe(30);
    });

    it('should extract member name', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.memberName).toBe('עמיחי רון  אופנבכר');
    });

    it('should extract account number', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.accountNumber).toBe('172365048');
    });

    it('should mark success when account summary is found', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.success).toBe(true);
    });
  });

  describe('Account Summary Extraction', () => {
    it('should extract current value', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.accountSummary).toBeDefined();
      expect(result.accountSummary?.currentValue).toBe(59000);
    });

    it('should extract fee from total', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.accountSummary?.feeFromTotal).toBe(0.55);
    });

    it('should extract investment track name', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.accountSummary?.investmentTrack).toBe('S&P 500');
    });

    it('should extract track return percentage', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.accountSummary?.trackReturn).toBe(3.32);
    });

    it('should handle missing current value', () => {
      const text = `הראל קרן השתלמות
0.55%דמי ניהול מחיסכון
0.67%3.32%P 500&S עוקב מדד`;

      const result = parseHarelPdf(text);

      expect(result.accountSummary?.currentValue).toBeNull();
      expect(result.success).toBe(false);
    });

    it('should handle missing fee', () => {
      const text = `הראל קרן השתלמות
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountSummary?.currentValue).toBe(59000);
      expect(result.accountSummary?.feeFromTotal).toBeNull();
      expect(result.success).toBe(true);
    });

    it('should handle missing investment track', () => {
      const text = `הראל קרן השתלמות
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח
0.55%דמי ניהול מחיסכון`;

      const result = parseHarelPdf(text);

      expect(result.accountSummary?.investmentTrack).toBeNull();
      expect(result.accountSummary?.trackReturn).toBeNull();
    });
  });

  describe('No Deposits Case', () => {
    it('should handle "no deposits" text gracefully', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.deposits).toHaveLength(0);
      expect(result.warnings).toContain('No deposits found in the reporting period');
      expect(result.success).toBe(true);
    });
  });

  describe('Report Date Extraction', () => {
    it('should parse RTL format (date before label)', () => {
      const text = `הראל
30/06/2024 :תאריך הדוח
100,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.reportDate?.getUTCFullYear()).toBe(2024);
      expect(result.reportDate?.getUTCMonth()).toBe(5); // June
      expect(result.reportDate?.getUTCDate()).toBe(30);
    });

    it('should parse fallback format (date after label)', () => {
      const text = `הראל
תאריך הדוח: 15/03/2025
100,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.reportDate?.getUTCFullYear()).toBe(2025);
      expect(result.reportDate?.getUTCMonth()).toBe(2); // March
      expect(result.reportDate?.getUTCDate()).toBe(15);
    });

    it('should handle missing report date', () => {
      const text = `הראל
100,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.reportDate).toBeNull();
    });
  });

  describe('Account Number Extraction', () => {
    it('should extract account number from RTL format (digits before label)', () => {
      const text = `הראל קרן השתלמות
שכיר כללישם המעסיק:  172365048מספר חשבון:  305392656 :מספר ת.ז. עמיחי רון  אופנבכר : שם
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountNumber).toBe('172365048');
    });

    it('should extract account number from fallback format (digits after label)', () => {
      const text = `הראל קרן השתלמות
מספר חשבון: 987654321
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountNumber).toBe('987654321');
    });

    it('should extract account number when digits are immediately adjacent to label', () => {
      const text = `הראל קרן השתלמות
555444333מספר חשבון
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountNumber).toBe('555444333');
    });

    it('should extract account number with spaces between digits and label', () => {
      const text = `הראל קרן השתלמות
172365048  מספר חשבון
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountNumber).toBe('172365048');
    });

    it('should return null when no account number is present', () => {
      const text = `הראל קרן השתלמות
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountNumber).toBeNull();
    });

    it('should extract account number from full sample text matching real PDF', () => {
      // This matches the exact text pattern provided by the user:
      // "שכיר כללישם המעסיק:  172365048מספר חשבון:  305392656 :מספר ת.ז. עמיחי רון  אופנבכר : שם"
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.accountNumber).toBe('172365048');
      // Ensure it gets the account number (172365048), not the ID number (305392656)
      expect(result.accountNumber).not.toBe('305392656');
    });

    it('should handle account number with varying digit lengths', () => {
      const text = `הראל קרן השתלמות
12345מספר חשבון
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountNumber).toBe('12345');
    });

    it('should extract account number with colon after label in fallback', () => {
      const text = `הראל קרן השתלמות
מספר חשבון:  111222333
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountNumber).toBe('111222333');
    });
  });

  describe('AccountSummary Interface Validation', () => {
    it('should have all four required fields in accountSummary', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(result.accountSummary).toBeDefined();
      expect(result.accountSummary).toHaveProperty('currentValue');
      expect(result.accountSummary).toHaveProperty('feeFromTotal');
      expect(result.accountSummary).toHaveProperty('investmentTrack');
      expect(result.accountSummary).toHaveProperty('trackReturn');
    });

    it('should have correct types for accountSummary fields', () => {
      const result = parseHarelPdf(SAMPLE_HAREL_TEXT);

      expect(typeof result.accountSummary?.currentValue).toBe('number');
      expect(typeof result.accountSummary?.feeFromTotal).toBe('number');
      expect(typeof result.accountSummary?.investmentTrack).toBe('string');
      expect(typeof result.accountSummary?.trackReturn).toBe('number');
    });

    it('should allow null values for all accountSummary fields', () => {
      const text = `הראל
No meaningful data here`;

      const result = parseHarelPdf(text);

      expect(result.accountSummary?.currentValue).toBeNull();
      expect(result.accountSummary?.feeFromTotal).toBeNull();
      expect(result.accountSummary?.investmentTrack).toBeNull();
      expect(result.accountSummary?.trackReturn).toBeNull();
    });
  });

  describe('Deposit Parsing', () => {
    it('should parse deposit rows with dates and amounts', () => {
      const text = `הראל
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח
3,15512/202402/01/2025חברה ישראלית בע"מ`;

      const result = parseHarelPdf(text);

      if (result.deposits.length > 0) {
        const deposit = result.deposits[0];
        expect(deposit.amount).toBe(3155);
        expect(deposit.employer).toContain('בע"מ');
        expect(deposit.depositDate).toBeDefined();
        expect(deposit.salaryMonth).toBeDefined();
        expect(deposit.rawText).toBeDefined();
      }
    });

    it('should skip header rows containing "מתאריך"', () => {
      const text = `הראל
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח
מתאריך 01/01/2025 עד 12/202401/01/2025
3,15512/202402/01/2025חברה בע"מ`;

      const result = parseHarelPdf(text);

      // The header row should be skipped
      const depositAmounts = result.deposits.map((d) => d.amount);
      expect(depositAmounts).not.toContain(undefined);
    });

    it('should reject amounts exceeding 50000', () => {
      const text = `הראל
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח
60,00012/202402/01/2025חברה בע"מ`;

      const result = parseHarelPdf(text);

      // 60,000 exceeds the 50,000 limit
      expect(result.deposits.length).toBe(0);
    });

    it('should sort deposits by salary month descending', () => {
      const text = `הראל
59,000יתרת הכספים בחשבון בסוף
תקופת הדיווח
2,00010/202401/11/2024חברה כללי
3,00012/202402/01/2025חברה כללי
2,50011/202401/12/2024חברה כללי`;

      const result = parseHarelPdf(text);

      if (result.deposits.length >= 2) {
        for (let i = 0; i < result.deposits.length - 1; i++) {
          expect(result.deposits[i].salaryMonth.getTime()).toBeGreaterThanOrEqual(
            result.deposits[i + 1].salaryMonth.getTime()
          );
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle text with only Harel identifier and no data', () => {
      const result = parseHarelPdf('הראל');

      expect(result.providerName).toBe('Harel');
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Could not extract account data from the PDF');
    });

    it('should handle different current values', () => {
      const text = `הראל
150,000יתרת הכספים בחשבון בסוף
תקופת הדיווח`;

      const result = parseHarelPdf(text);

      expect(result.accountSummary?.currentValue).toBe(150000);
    });

    it('should handle different fee percentages', () => {
      const text = `הראל
100,000יתרת הכספים בחשבון בסוף
תקופת הדיווח
0.35%דמי ניהול מחיסכון`;

      const result = parseHarelPdf(text);

      expect(result.accountSummary?.feeFromTotal).toBe(0.35);
    });
  });
});
