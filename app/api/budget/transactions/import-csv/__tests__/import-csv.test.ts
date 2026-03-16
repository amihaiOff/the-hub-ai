/**
 * Integration tests for /api/budget/transactions/import-csv route
 * Tests CSV file upload with server-side parsing and import
 */

import { NextRequest } from 'next/server';

// Simple Decimal mock that mimics Prisma Decimal behavior
const createDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => String(value),
  valueOf: () => value,
});

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetPayee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    riseupCategory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    budgetTransaction: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    payeeCategoryRule: {
      findMany: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

jest.mock('@/lib/auth-api-key', () => ({
  getHouseholdIdFromApiKey: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { getHouseholdIdFromApiKey } from '@/lib/auth-api-key';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockGetHouseholdIdFromApiKey = getHouseholdIdFromApiKey as jest.MockedFunction<
  typeof getHouseholdIdFromApiKey
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Valid Riseup CSV with Hebrew headers
const VALID_CSV_HEADERS = [
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

function makeCsvRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    flowMonth: '2025-01',
    payeeName: 'Test Store',
    paymentMethod: 'visa',
    paymentIdentifier: '1234',
    transactionDate: '15/01/2025',
    transactionMonth: '01',
    transactionYear: '2025',
    paymentDate: '20/01/2025',
    amount: '-100',
    chargeCurrency: 'ILS',
    paymentNumber: '',
    totalPayments: '',
    riseupCategory: 'מזון',
    excludedFromFlow: 'false',
    notes: '',
    sourceType: 'CreditCard',
    originalAmount: '-100',
  };
  const row = { ...defaults, ...overrides };
  return [
    row.flowMonth,
    row.payeeName,
    row.paymentMethod,
    row.paymentIdentifier,
    row.transactionDate,
    row.transactionMonth,
    row.transactionYear,
    row.paymentDate,
    row.amount,
    row.chargeCurrency,
    row.paymentNumber,
    row.totalPayments,
    row.riseupCategory,
    row.excludedFromFlow,
    row.notes,
    row.sourceType,
    row.originalAmount,
  ].join(',');
}

function makeCsv(...rows: string[]): string {
  return [VALID_CSV_HEADERS, ...rows].join('\n');
}

function makeFormDataRequest(file: File): NextRequest {
  const formData = new FormData();
  formData.append('file', file);
  return new NextRequest('http://localhost:3000/api/budget/transactions/import-csv', {
    method: 'POST',
    body: formData,
  });
}

function makeFile(content: string, name = 'transactions.csv', type = 'text/csv'): File {
  return new File([content], name, { type });
}

describe('Import CSV API', () => {
  const mockContext = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    profile: {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      userId: 'user-1',
    },
    households: [
      { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
    ],
    activeHousehold: {
      id: 'household-1',
      name: 'Test Household',
      description: null,
      role: 'owner' as const,
    },
    householdProfiles: [
      {
        id: 'profile-1',
        name: 'Test Profile',
        image: null,
        color: null,
        role: 'owner' as const,
        hasUser: true,
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    // Payee category rules are fetched first in importTransactions — default to empty
    (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValue([]);
  });

  // ==========================================
  // Authentication
  // ==========================================
  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    mockGetHouseholdIdFromApiKey.mockResolvedValueOnce(null);

    const csv = makeCsv(makeCsvRow());
    const request = makeFormDataRequest(makeFile(csv));

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should authenticate via API key when session auth fails', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    mockGetHouseholdIdFromApiKey.mockResolvedValueOnce('household-1');

    (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'payee-1', name: 'Test Store', categoryId: null },
    ]);
    (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
    (mockPrisma.riseupCategory.create as jest.Mock).mockResolvedValueOnce({
      id: 'rc-1',
      name: 'מזון',
    });
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

    const csv = makeCsv(makeCsvRow());
    const request = makeFormDataRequest(makeFile(csv));

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.created).toBe(1);
  });

  // ==========================================
  // File Validation
  // ==========================================
  describe('file validation', () => {
    it('should return 400 when no file is uploaded', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const formData = new FormData();
      const request = new NextRequest('http://localhost:3000/api/budget/transactions/import-csv', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('No file uploaded');
    });

    it('should return 400 when file is not a CSV', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const file = new File(['not a csv'], 'data.txt', { type: 'text/plain' });
      const request = makeFormDataRequest(file);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid file type');
    });

    it('should return 400 when file exceeds 5MB', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // Create a file that's just over 5MB
      const largeContent = 'x'.repeat(5 * 1024 * 1024 + 1);
      const file = makeFile(largeContent);
      const request = makeFormDataRequest(file);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('File too large');
    });
  });

  // ==========================================
  // CSV Parsing
  // ==========================================
  describe('CSV parsing', () => {
    it('should return 400 when CSV has missing required headers', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const csv = 'col1,col2\nval1,val2';
      const request = makeFormDataRequest(makeFile(csv));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('CSV parsing failed');
      expect(data.details).toBeDefined();
    });

    it('should return 400 when CSV has no data rows', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      // Only headers, no data
      const csv = VALID_CSV_HEADERS;
      const request = makeFormDataRequest(makeFile(csv));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      // Parser returns error "CSV file is empty or has no data rows"
      expect(data.error).toBe('CSV parsing failed');
      expect(data.details).toContain('CSV file is empty or has no data rows');
    });

    it('should return 400 for rows with invalid dates', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const csv = makeCsv(makeCsvRow({ transactionDate: 'not-a-date' }));
      const request = makeFormDataRequest(makeFile(csv));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      // Parsing errors about the invalid date, but also no valid transactions
      expect(data.error).toBeDefined();
    });
  });

  // ==========================================
  // Successful Import
  // ==========================================
  describe('successful import', () => {
    it('should parse CSV and import transactions', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Test Store', categoryId: null },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.create as jest.Mock).mockResolvedValueOnce({
        id: 'rc-1',
        name: 'מזון',
      });
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const csv = makeCsv(makeCsvRow());
      const request = makeFormDataRequest(makeFile(csv));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.created).toBe(1);
      expect(data.data.duplicatesSkipped).toBe(0);
    });

    it('should import multiple transactions from CSV', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Store A', categoryId: null },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.create as jest.Mock).mockResolvedValueOnce({
        id: 'rc-1',
        name: 'מזון',
      });
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

      // New payee for second transaction
      (mockPrisma.budgetPayee.create as jest.Mock).mockResolvedValueOnce({
        id: 'payee-new',
        name: 'Store B',
      });

      (mockPrisma.budgetTransaction.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'tx-1' })
        .mockResolvedValueOnce({ id: 'tx-2' });

      const csv = makeCsv(
        makeCsvRow({ payeeName: 'Store A', amount: '-50' }),
        makeCsvRow({ payeeName: 'Store B', amount: '-75', transactionDate: '16/01/2025' })
      );
      const request = makeFormDataRequest(makeFile(csv));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(2);
    });

    it('should return correct response shape', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);

      (mockPrisma.budgetPayee.create as jest.Mock).mockResolvedValueOnce({
        id: 'payee-new',
        name: 'Test Store',
      });
      (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

      const csv = makeCsv(makeCsvRow({ riseupCategory: '' }));
      const request = makeFormDataRequest(makeFile(csv));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: {
          created: expect.any(Number),
          duplicatesSkipped: expect.any(Number),
          payeesCreated: expect.any(Array),
        },
      });
    });
  });

  // ==========================================
  // Duplicate Detection
  // ==========================================
  describe('duplicate detection', () => {
    it('should skip duplicate transactions', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Test Store', categoryId: null },
      ]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([
        {
          transactionDate: new Date('2025-01-15'),
          amountIls: createDecimal(100),
          payee: { name: 'Test Store' },
        },
      ]);

      const csv = makeCsv(makeCsvRow());
      const request = makeFormDataRequest(makeFile(csv));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.created).toBe(0);
      expect(data.data.duplicatesSkipped).toBe(1);
    });
  });

  // ==========================================
  // BOM handling
  // ==========================================
  it('should handle CSV with BOM character', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);

    (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'payee-1', name: 'Test Store', categoryId: null },
    ]);
    (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
    (mockPrisma.riseupCategory.create as jest.Mock).mockResolvedValueOnce({
      id: 'rc-1',
      name: 'מזון',
    });
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
    (mockPrisma.budgetTransaction.create as jest.Mock).mockResolvedValueOnce({ id: 'tx-1' });

    // Add BOM character
    const csv = '\uFEFF' + makeCsv(makeCsvRow());
    const request = makeFormDataRequest(makeFile(csv));

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.created).toBe(1);
  });

  // ==========================================
  // Error handling
  // ==========================================
  it('should return 500 on unexpected database error', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);

    (mockPrisma.budgetPayee.findMany as jest.Mock).mockRejectedValueOnce(
      new Error('Connection lost')
    );
    // riseupCategory findMany also needs to be mocked since it may be called
    (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);

    const csv = makeCsv(makeCsvRow());
    const request = makeFormDataRequest(makeFile(csv));

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to import CSV');
  });
});
