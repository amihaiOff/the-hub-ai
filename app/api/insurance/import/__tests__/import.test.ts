/**
 * Integration tests for POST /api/insurance/import
 *
 * These tests exercise the real `xlsx` parser by generating genuine .xlsx
 * buffers, so the branch-heavy `parseInsuranceExcel` helper is covered end to
 * end. Prisma and auth are mocked following the repo convention.
 */

import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';

// Mocks must be declared before importing the route.
jest.mock('@/lib/db', () => ({
  prisma: {
    householdMember: {
      findFirst: jest.fn(),
    },
    insurancePolicy: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  householdMember: { findFirst: jest.Mock };
  insurancePolicy: { deleteMany: jest.Mock; create: jest.Mock };
};

const mockContext = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
  households: [
    { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
  ],
  activeHousehold: {
    id: 'household-1',
    name: 'Test Household',
    description: null,
    role: 'owner' as const,
  },
  householdProfiles: [],
};

// ---- helpers ---------------------------------------------------------------

type Cell = string | number | null | undefined;

function makeXlsxFile(aoa: Cell[][], name = 'insurance.xlsx', sheetName = 'תיק ביטוחי'): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa as (string | number)[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new File([new Uint8Array(buf)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function makeFormData(file: File | null, profileId: string | null): FormData {
  const fd = new FormData();
  if (file) fd.append('file', file);
  if (profileId !== null) fd.append('profileId', profileId);
  return fd;
}

function makeRequest(body: BodyInit): NextRequest {
  return new NextRequest('http://localhost/api/insurance/import', {
    method: 'POST',
    body,
  });
}

// הר הביטוח (10-column) header row.
const HAR_HEADER: Cell[] = [
  'תעודת זהות',
  'ענף ראשי',
  'ענף (משני)',
  'סוג מוצר',
  'חברה',
  'תקופת ביטוח',
  'פרטים נוספים',
  'פרמיה בש"ח',
  'סוג פרמיה',
  'מספר פוליסה',
  'סיווג תכנית',
];

// שב"ן (7-column) header row.
const SHABAN_HEADER: Cell[] = [
  'תעודת זהות',
  'ענף (משני)',
  'סוג מוצר',
  'חברה',
  'תקופת כיסוי',
  'פרמיה',
  'סוג פרמיה',
];

function authAndValidProfile() {
  mockGetCurrentContext.mockResolvedValue(mockContext);
  mockPrisma.householdMember.findFirst.mockResolvedValue({ id: 'member-1' });
  mockPrisma.insurancePolicy.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.insurancePolicy.create.mockImplementation(async (args: { data: unknown }) => ({
    id: 'created',
    ...(args.data as object),
  }));
}

// ---- tests -----------------------------------------------------------------

describe('POST /api/insurance/import', () => {
  beforeEach(() => jest.resetAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);
    const file = makeXlsxFile([HAR_HEADER, ['1', 'ביטוח חיים']]);
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('returns 400 when the body is not multipart form data', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const req = new NextRequest('http://localhost/api/insurance/import', {
      method: 'POST',
      body: JSON.stringify({ nope: true }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/multipart/i);
  });

  it('returns 400 when no file is included', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const res = await POST(makeRequest(makeFormData(null, 'profile-1')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/No file uploaded/i);
  });

  it('returns 400 when the "file" field is not a File', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const fd = new FormData();
    fd.append('file', 'just-a-string');
    fd.append('profileId', 'profile-1');
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/No file uploaded/i);
  });

  it('returns 400 when profileId is missing', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const file = makeXlsxFile([HAR_HEADER, ['1', 'ביטוח חיים']]);
    const res = await POST(makeRequest(makeFormData(file, null)));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/profileId is required/i);
  });

  it('returns 400 when profileId is blank/whitespace', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const file = makeXlsxFile([HAR_HEADER, ['1', 'ביטוח חיים']]);
    const res = await POST(makeRequest(makeFormData(file, '   ')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/profileId is required/i);
  });

  it('returns 400 for an invalid (non-xlsx) file type', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const file = new File([new Uint8Array([1, 2, 3])], 'report.pdf', {
      type: 'application/pdf',
    });
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Invalid file type/i);
  });

  it('returns 400 when the file exceeds the 10MB limit', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    const tooBig = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.xlsx');
    const res = await POST(makeRequest(makeFormData(tooBig, 'profile-1')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/too large/i);
  });

  it('returns 400 when the profile does not belong to the household', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockPrisma.householdMember.findFirst.mockResolvedValue(null);
    const file = makeXlsxFile([HAR_HEADER, ['1', 'ביטוח חיים']]);
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Profile not found in household');
    expect(mockPrisma.householdMember.findFirst).toHaveBeenCalledWith({
      where: { householdId: 'household-1', profileId: 'profile-1' },
    });
  });

  it('returns 400 when the Excel file cannot be parsed', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ id: 'member-1' });
    // A buffer with the ZIP magic bytes (PK\x03\x04) but a corrupt body forces
    // XLSX to treat it as an xlsx (zip) container and throw while unzipping.
    const corrupt = new Uint8Array(64);
    corrupt.set([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
    for (let i = 4; i < corrupt.length; i++) corrupt[i] = 0xff;
    const file = new File([corrupt], 'bad.xlsx');
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Failed to parse/i);
    expect(mockPrisma.insurancePolicy.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 400 when the file contains no policy rows (headers/sections only)', async () => {
    authAndValidProfile();
    const file = makeXlsxFile([
      ['הר הביטוח'],
      HAR_HEADER,
      [null, 'תחום - בריאות'],
      [null, 'תחום - חיים'],
    ]);
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/No policies found/i);
    expect(mockPrisma.insurancePolicy.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.insurancePolicy.create).not.toHaveBeenCalled();
  });

  it('imports har-habitua rows, skipping section/id/blank rows and mapping fields', async () => {
    authAndValidProfile();
    const file = makeXlsxFile([
      ['הר הביטוח - סיכום'],
      HAR_HEADER,
      [null, 'תחום - בריאות'], // section separator -> skipped
      [
        '123456789',
        'ביטוח חיים',
        'ריסק',
        'ריסק למקרה מוות',
        'הראל',
        '2020-2030',
        'פרטים כלשהם',
        '1,234.50', // comma-formatted premium
        'חודשי',
        'POL-1',
        'רגיל',
      ],
      [
        '123456789',
        'ביטוח בריאות',
        null,
        null,
        'מגדל',
        null,
        null,
        250, // numeric premium
        'חודשי',
        'POL-2',
        null,
      ],
      ['999', '', null, null, null, null, null, null, null, null, null], // blank mainBranch -> skipped
    ]);

    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.imported).toBe(2);

    // Replace-on-import: existing policies deleted, scoped to household+profile.
    expect(mockPrisma.insurancePolicy.deleteMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', profileId: 'profile-1' },
    });

    expect(mockPrisma.insurancePolicy.create).toHaveBeenCalledTimes(2);

    const first = mockPrisma.insurancePolicy.create.mock.calls[0][0].data;
    expect(first).toMatchObject({
      profileId: 'profile-1',
      householdId: 'household-1',
      mainBranch: 'ביטוח חיים',
      subBranch: 'ריסק',
      productType: 'ריסק למקרה מוות',
      company: 'הראל',
      insurancePeriod: '2020-2030',
      additionalDetails: 'פרטים כלשהם',
      premiumIls: 1234.5, // comma stripped + parsed
      premiumType: 'חודשי',
      policyNumber: 'POL-1',
      planClassification: 'רגיל',
    });

    const second = mockPrisma.insurancePolicy.create.mock.calls[1][0].data;
    expect(second).toMatchObject({
      mainBranch: 'ביטוח בריאות',
      subBranch: null,
      productType: null,
      company: 'מגדל',
      premiumIls: 250, // numeric passthrough
      policyNumber: 'POL-2',
      planClassification: null,
    });
  });

  it('parses invalid premium strings as null', async () => {
    authAndValidProfile();
    const file = makeXlsxFile([
      HAR_HEADER,
      ['1', 'ביטוח חיים', null, null, 'הראל', null, null, 'not-a-number', 'חודשי', 'P1', null],
    ]);
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(200);
    const call = mockPrisma.insurancePolicy.create.mock.calls[0][0].data;
    expect(call.premiumIls).toBeNull();
  });

  it('imports שב"ן-format rows and derives mainBranch from productType', async () => {
    authAndValidProfile();
    const file = makeXlsxFile([
      SHABAN_HEADER,
      ['123', 'שיניים', 'שב"ן זהב', 'כללית', '2021-2025', '99.9', 'חודשי'],
    ]);
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.imported).toBe(1);

    const call = mockPrisma.insurancePolicy.create.mock.calls[0][0].data;
    expect(call).toMatchObject({
      mainBranch: 'שב"ן זהב', // from productType
      subBranch: 'שיניים',
      productType: 'שב"ן זהב',
      company: 'כללית',
      insurancePeriod: '2021-2025',
      premiumIls: 99.9,
      premiumType: 'חודשי',
      policyNumber: null,
      planClassification: null,
    });
  });

  it('falls back to "שב"ן" mainBranch when productType is empty', async () => {
    authAndValidProfile();
    const file = makeXlsxFile([
      SHABAN_HEADER,
      ['123', 'שיניים', null, 'כללית', '2021', '50', 'חודשי'],
    ]);
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(200);
    const call = mockPrisma.insurancePolicy.create.mock.calls[0][0].data;
    expect(call.mainBranch).toBe('שב"ן');
    expect(call.productType).toBeNull();
  });

  it('returns 500 when a database operation throws unexpectedly', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    mockPrisma.householdMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.insurancePolicy.deleteMany.mockRejectedValue(new Error('DB down'));
    const file = makeXlsxFile([HAR_HEADER, ['1', 'ביטוח חיים', null, null, 'הראל']]);
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/Failed to import/i);
  });

  it('accepts .xls files (legacy extension) as valid', async () => {
    authAndValidProfile();
    const file = makeXlsxFile([HAR_HEADER, ['1', 'ביטוח חיים', null, null, 'הראל']], 'old.xls');
    const res = await POST(makeRequest(makeFormData(file, 'profile-1')));
    // Type guard passes; parsing proceeds. Content is real xlsx bytes so it parses.
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.imported).toBe(1);
  });
});
