/**
 * Integration tests for /api/pension/deposits/bulk route
 * Tests bulk pension deposit creation with validation and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client. Route uses findFirst for the household-scoped
// parent-account load (H1).
jest.mock('@/lib/db', () => ({
  prisma: {
    pensionAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    pensionDeposit: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

// Route migrated to household+profile scoping (H1). Mock getCurrentContext.
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as unknown as {
  pensionAccount: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  pensionDeposit: {
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function makeContext(user: { id: string; email?: string | null; name?: string | null }) {
  const profile = {
    id: `profile-${user.id}`,
    name: user.name ?? 'Test User',
    image: null,
    color: null,
    userId: user.id,
  };
  const household = {
    id: 'household-1',
    name: 'Household',
    description: null,
    role: 'owner' as const,
  };
  return {
    user: { id: user.id, email: user.email ?? 'test@example.com', name: user.name ?? 'Test User' },
    profile,
    households: [household],
    activeHousehold: household,
    householdProfiles: [{ ...profile, role: 'owner' as const, hasUser: true }],
  };
}

describe('Bulk Deposits API', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('POST /api/pension/deposits/bulk', () => {
    it('should create multiple deposits successfully', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        type: 'pension',
        providerName: 'Meitav',
      };

      const depositsInput = [
        {
          depositDate: '2025-01-02',
          salaryMonth: '2024-12-01',
          amount: 3000,
          employer: 'Company A',
        },
        {
          depositDate: '2024-12-02',
          salaryMonth: '2024-11-01',
          amount: 2500,
          employer: 'Company A',
        },
      ];

      const createdDeposits = depositsInput.map((d, i) => ({
        id: `dep-${i + 1}`,
        accountId: 'acc-1',
        depositDate: new Date(d.depositDate),
        salaryMonth: new Date(d.salaryMonth),
        amount: d.amount,
        employer: d.employer,
      }));

      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(mockAccount);
      // Mock sequential create calls
      createdDeposits.forEach((deposit) => {
        (mockPrisma.pensionDeposit.create as jest.Mock).mockResolvedValueOnce(deposit);
      });

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: depositsInput,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.count).toBe(2);
      expect(data.data.deposits).toHaveLength(2);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when accountId is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account ID is required');
    });

    it('should return 400 when deposits array is empty', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('At least one deposit is required');
    });

    it('should return 400 when deposits is not an array', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: 'not an array',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('At least one deposit is required');
    });

    it('should return 400 when deposits exceed maximum limit of 100', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      // Create 101 deposits to exceed the limit
      const deposits = Array.from({ length: 101 }, (_, i) => ({
        depositDate: '2025-01-02',
        salaryMonth: '2024-12-01',
        amount: 1000 + i,
        employer: `Company ${i}`,
      }));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Maximum 100 deposits allowed per request');
    });

    it('should return 400 when deposit date is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Deposit 1');
      expect(data.error).toContain('Deposit date is required');
    });

    it('should return 400 for invalid deposit date format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: 'not-a-date',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid deposit date format');
    });

    it('should return 400 when salary month is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Salary month is required');
    });

    it('should return 400 for invalid salary month format', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: 'invalid-month',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid salary month format');
    });

    it('should return 400 when amount is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Amount is required');
    });

    it('should return 400 when amount is zero', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 0,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Amount is required');
    });

    it('should allow negative amounts for refunds/corrections', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      // Mock the account lookup
      mockPrisma.pensionAccount.findFirst.mockResolvedValueOnce({
        id: 'acc-1',
        userId: mockUser.id,
        providerName: 'Meitav',
        accountName: 'Pension',
        currentValue: 50000,
        feeFromDeposit: 0,
        feeFromTotal: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock the deposit creation - use object with valueOf for Number() conversion
      const mockAmount = { toNumber: () => -500, valueOf: () => -500 };
      mockPrisma.pensionDeposit.create.mockResolvedValueOnce({
        id: 'dep-1',
        accountId: 'acc-1',
        depositDate: new Date('2025-01-02'),
        salaryMonth: new Date('2024-12-01'),
        amount: mockAmount,
        employer: 'Company',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: -500,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deposits[0].amount).toBe(-500);
    });

    it('should return 400 when employer is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Employer name is required');
    });

    it('should return 400 when employer is empty string', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: '   ',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Employer name is required');
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'non-existent',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });

    it('should return 404 when account is not visible to the household', async () => {
      // Household scoping (H1) — not-found and not-your-household collapse to 404.
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account not found');
    });

    it('should validate all deposits before creating any', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-11-01',
              amount: 0, // Invalid - zero amount
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Deposit 2');
      // Should not have attempted to create any deposits
      expect(mockPrisma.pensionDeposit.create).not.toHaveBeenCalled();
    });

    it('should indicate which deposit has validation error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-11-01',
              amount: 2500,
              employer: 'Company',
            },
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-10-01',
              amount: 2000,
              employer: '', // Invalid
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Deposit 3');
    });

    it('should trim employer name before saving', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        type: 'pension',
      };

      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(mockAccount);
      (mockPrisma.pensionDeposit.create as jest.Mock).mockResolvedValueOnce({
        id: 'dep-1',
        accountId: 'acc-1',
        depositDate: new Date('2025-01-02'),
        salaryMonth: new Date('2024-12-01'),
        amount: 3000,
        employer: 'Company Name', // Trimmed
      });

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: '  Company Name  ',
            },
          ],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify create was called with trimmed employer
      expect(mockPrisma.pensionDeposit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employer: 'Company Name',
        }),
      });
    });

    it('should handle database errors and rollback created deposits', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        type: 'pension',
      };

      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(mockAccount);
      // First create succeeds, second fails
      (mockPrisma.pensionDeposit.create as jest.Mock)
        .mockResolvedValueOnce({
          id: 'dep-1',
          accountId: 'acc-1',
          depositDate: new Date('2025-01-02'),
          salaryMonth: new Date('2024-12-01'),
          amount: 3000,
          employer: 'Company',
        })
        .mockRejectedValueOnce(new Error('Database error'));
      (mockPrisma.pensionDeposit.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000,
              employer: 'Company',
            },
            {
              depositDate: '2024-12-02',
              salaryMonth: '2024-11-01',
              amount: 2500,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create deposits');
      // Verify rollback was called with the created deposit id
      expect(mockPrisma.pensionDeposit.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['dep-1'] } },
      });
    });

    it('should handle numeric amounts in response', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        type: 'pension',
      };

      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(mockAccount);
      (mockPrisma.pensionDeposit.create as jest.Mock).mockResolvedValueOnce({
        id: 'dep-1',
        accountId: 'acc-1',
        depositDate: new Date('2025-01-02'),
        salaryMonth: new Date('2024-12-01'),
        amount: 3000.5, // Numeric value
        employer: 'Company',
      });

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3000.5,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.deposits[0].amount).toBe(3000.5);
    });
  });

  describe('Financial Validation', () => {
    it('should handle large deposit amounts', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        type: 'pension',
      };

      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(mockAccount);
      (mockPrisma.pensionDeposit.create as jest.Mock).mockResolvedValueOnce({
        id: 'dep-1',
        accountId: 'acc-1',
        depositDate: new Date('2025-01-02'),
        salaryMonth: new Date('2024-12-01'),
        amount: 50000,
        employer: 'High Value Company',
      });

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 50000,
              employer: 'High Value Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.deposits[0].amount).toBe(50000);
    });

    it('should handle decimal amounts correctly', async () => {
      const mockAccount = {
        id: 'acc-1',
        userId: 'user-1',
        type: 'pension',
      };

      mockGetCurrentContext.mockResolvedValueOnce(makeContext(mockUser));
      (mockPrisma.pensionAccount.findFirst as jest.Mock).mockResolvedValueOnce(mockAccount);
      (mockPrisma.pensionDeposit.create as jest.Mock).mockResolvedValueOnce({
        id: 'dep-1',
        accountId: 'acc-1',
        depositDate: new Date('2025-01-02'),
        salaryMonth: new Date('2024-12-01'),
        amount: 3155.5,
        employer: 'Company',
      });

      const request = new NextRequest('http://localhost:3000/api/pension/deposits/bulk', {
        method: 'POST',
        body: JSON.stringify({
          accountId: 'acc-1',
          deposits: [
            {
              depositDate: '2025-01-02',
              salaryMonth: '2024-12-01',
              amount: 3155.5,
              employer: 'Company',
            },
          ],
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.deposits[0].amount).toBeCloseTo(3155.5, 2);
    });
  });
});
