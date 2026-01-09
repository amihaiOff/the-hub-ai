/**
 * Integration tests for /api/pension/parse-pdf route
 * Tests PDF upload, parsing, and validation
 */

import { NextRequest } from 'next/server';

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: jest.fn(),
}));

// Mock the PDF parser
jest.mock('@/lib/pdf/meitav-parser', () => ({
  parseMeitavPdf: jest.fn(),
}));

import { getCurrentUser } from '@/lib/auth-utils';
import { parseMeitavPdf } from '@/lib/pdf/meitav-parser';
import { POST } from '../route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockParseMeitavPdf = parseMeitavPdf as jest.MockedFunction<typeof parseMeitavPdf>;

// Helper to create a mock File for FormData
// Must include PDF magic bytes (%PDF-) for validation
function createMockPdfFile(name: string, content: string): File {
  // PDF files must start with %PDF- magic bytes
  const pdfContent = '%PDF-' + content;
  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

function createMockNonPdfFile(name: string, content: string): File {
  const blob = new Blob([content], { type: 'text/plain' });
  return new File([blob], name, { type: 'text/plain' });
}

describe('Parse PDF API', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /api/pension/parse-pdf', () => {
    it('should parse PDF and return deposits successfully', async () => {
      const mockResult = {
        success: true,
        deposits: [
          {
            depositDate: new Date('2025-01-02'),
            salaryMonth: new Date('2024-12-01'),
            amount: 3000,
            employer: 'Test Company',
            rawText: 'raw line',
          },
          {
            depositDate: new Date('2024-12-02'),
            salaryMonth: new Date('2024-11-01'),
            amount: 2500,
            employer: 'Test Company',
            rawText: 'raw line 2',
          },
        ],
        errors: [],
        warnings: [],
        providerName: 'Meitav',
        reportDate: new Date('2025-01-15'),
        memberName: 'Test User',
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('pension.pdf', 'fake pdf content'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deposits).toHaveLength(2);
      expect(data.data.providerName).toBe('Meitav');
      expect(data.data.memberName).toBe('Test User');
    });

    it('should return deposits as ISO date strings', async () => {
      const mockResult = {
        success: true,
        deposits: [
          {
            depositDate: new Date('2025-01-02'),
            salaryMonth: new Date('2024-12-01'),
            amount: 3000,
            employer: 'Company',
            rawText: 'line',
          },
        ],
        errors: [],
        warnings: [],
        providerName: 'Meitav',
        reportDate: new Date('2025-01-15'),
        memberName: null,
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('pension.pdf', 'pdf'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Dates should be ISO strings (YYYY-MM-DD format)
      expect(data.data.deposits[0].depositDate).toBe('2025-01-02');
      expect(data.data.deposits[0].salaryMonth).toBe('2024-12-01');
      expect(data.data.reportDate).toBe('2025-01-15');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('pension.pdf', 'pdf'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when no file provided', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const formData = new FormData();
      // No file appended

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('No file provided or invalid file');
    });

    it('should return 400 when file is not a PDF', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const formData = new FormData();
      formData.append('file', createMockNonPdfFile('document.txt', 'text content'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('File must be a PDF');
    });

    // Note: Testing file size limits is difficult in Jest because File.size is readonly
    // and cannot be properly mocked. This validation is tested manually/in E2E tests.
    // The route.ts checks: if (file.size > maxSize) return 400

    it('should return 400 when PDF parsing fails', async () => {
      const mockResult = {
        success: false,
        deposits: [],
        errors: ['This does not appear to be a Meitav pension report'],
        warnings: [],
        providerName: null,
        reportDate: null,
        memberName: null,
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('wrong.pdf', 'not meitav'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to parse PDF');
      expect(data.details).toContain('This does not appear to be a Meitav pension report');
    });

    it('should return 400 when no deposits found in PDF', async () => {
      const mockResult = {
        success: false,
        deposits: [],
        errors: ['No deposits found in the PDF'],
        warnings: [],
        providerName: 'Meitav',
        reportDate: new Date('2025-01-15'),
        memberName: 'Test User',
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('empty.pdf', 'meitav no deposits'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.details).toContain('No deposits found in the PDF');
    });

    it('should handle PDF parsing exceptions gracefully', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockRejectedValueOnce(new Error('PDF is encrypted'));

      const formData = new FormData();
      formData.append('file', createMockPdfFile('encrypted.pdf', 'encrypted content'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to parse PDF');
    });

    it('should include warnings in successful response', async () => {
      const mockResult = {
        success: true,
        deposits: [
          {
            depositDate: new Date('2025-01-02'),
            salaryMonth: new Date('2024-12-01'),
            amount: 3000,
            employer: 'Company',
            rawText: 'line',
          },
        ],
        errors: [],
        warnings: ['Some deposits may have missing data'],
        providerName: 'Meitav',
        reportDate: new Date('2025-01-15'),
        memberName: 'Test User',
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('pension.pdf', 'pdf'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.warnings).toHaveLength(1);
      expect(data.data.warnings).toContain('Some deposits may have missing data');
    });

    it('should handle null report date', async () => {
      const mockResult = {
        success: true,
        deposits: [
          {
            depositDate: new Date('2025-01-02'),
            salaryMonth: new Date('2024-12-01'),
            amount: 3000,
            employer: 'Company',
            rawText: 'line',
          },
        ],
        errors: [],
        warnings: [],
        providerName: 'Meitav',
        reportDate: null,
        memberName: 'Test User',
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('pension.pdf', 'pdf'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.reportDate).toBeNull();
    });

    it('should handle null member name', async () => {
      const mockResult = {
        success: true,
        deposits: [
          {
            depositDate: new Date('2025-01-02'),
            salaryMonth: new Date('2024-12-01'),
            amount: 3000,
            employer: 'Company',
            rawText: 'line',
          },
        ],
        errors: [],
        warnings: [],
        providerName: 'Meitav',
        reportDate: new Date('2025-01-15'),
        memberName: null,
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('pension.pdf', 'pdf'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.memberName).toBeNull();
    });
  });

  describe('File Validation Edge Cases', () => {
    // Note: File size limit tests cannot be reliably mocked in Jest/Node.js
    // because File.size is readonly. The validation (> 5MB) is tested manually.

    it('should handle form data with wrong field name', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const formData = new FormData();
      formData.append('document', createMockPdfFile('pension.pdf', 'pdf')); // Wrong field name

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided or invalid file');
    });
  });

  describe('Response Format', () => {
    it('should strip rawText from deposit responses', async () => {
      const mockResult = {
        success: true,
        deposits: [
          {
            depositDate: new Date('2025-01-02'),
            salaryMonth: new Date('2024-12-01'),
            amount: 3000,
            employer: 'Company',
            rawText: 'This should not appear in response',
          },
        ],
        errors: [],
        warnings: [],
        providerName: 'Meitav',
        reportDate: new Date('2025-01-15'),
        memberName: null,
      };

      mockGetCurrentUser.mockResolvedValueOnce(mockUser);
      mockParseMeitavPdf.mockResolvedValueOnce(mockResult);

      const formData = new FormData();
      formData.append('file', createMockPdfFile('pension.pdf', 'pdf'));

      const request = new NextRequest('http://localhost:3000/api/pension/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // The response should not include rawText
      expect(data.data.deposits[0]).not.toHaveProperty('rawText');
      expect(data.data.deposits[0]).toHaveProperty('depositDate');
      expect(data.data.deposits[0]).toHaveProperty('salaryMonth');
      expect(data.data.deposits[0]).toHaveProperty('amount');
      expect(data.data.deposits[0]).toHaveProperty('employer');
    });
  });
});
