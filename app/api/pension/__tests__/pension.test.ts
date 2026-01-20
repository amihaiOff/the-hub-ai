/**
 * Integration tests for /api/pension endpoint
 * Tests pension summary fetching
 */

// Mock the auth-utils module
const mockGetCurrentUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock Prisma client
const mockPrisma = {
  pensionAccount: {
    findMany: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

import { GET } from '../route';

describe('Pension API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
  };

  describe('GET /api/pension', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns empty data when no accounts exist', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionAccount.findMany.mockResolvedValue([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe('user-123');
      expect(data.data.totalValue).toBe(0);
      expect(data.data.totalDeposits).toBe(0);
      expect(data.data.thisMonthDeposits).toBe(0);
      expect(data.data.accountsCount).toBe(0);
      expect(data.data.accounts).toEqual([]);
    });

    it('returns pension summary with accounts', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      mockPrisma.pensionAccount.findMany.mockResolvedValue([
        {
          id: 'account-1',
          type: 'hishtalmut',
          providerName: 'Provider A',
          accountName: 'My Hishtalmut',
          currentValue: 100000,
          feeFromDeposit: 0.05,
          feeFromTotal: 0.005,
          deposits: [
            {
              id: 'deposit-1',
              depositDate: new Date('2024-01-15'),
              salaryMonth: currentMonth,
              amount: 5000,
              employer: 'Company A',
            },
            {
              id: 'deposit-2',
              depositDate: new Date('2023-12-15'),
              salaryMonth: lastMonth,
              amount: 4500,
              employer: 'Company A',
            },
          ],
          owners: [
            {
              profile: {
                id: 'profile-1',
                name: 'Test User',
                image: null,
                color: '#3b82f6',
              },
            },
          ],
        },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe('user-123');
      expect(data.data.totalValue).toBe(100000);
      expect(data.data.totalDeposits).toBe(9500);
      expect(data.data.thisMonthDeposits).toBe(5000);
      expect(data.data.accountsCount).toBe(1);
      expect(data.data.accounts).toHaveLength(1);
      expect(data.data.accounts[0].id).toBe('account-1');
      expect(data.data.accounts[0].owners).toHaveLength(1);
    });

    it('calculates totals across multiple accounts', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      mockPrisma.pensionAccount.findMany.mockResolvedValue([
        {
          id: 'account-1',
          type: 'hishtalmut',
          providerName: 'Provider A',
          accountName: 'Account 1',
          currentValue: 50000,
          feeFromDeposit: 0.05,
          feeFromTotal: 0.005,
          deposits: [
            {
              id: 'deposit-1',
              depositDate: new Date('2024-01-15'),
              salaryMonth: currentMonth,
              amount: 3000,
              employer: 'Company A',
            },
          ],
          owners: [],
        },
        {
          id: 'account-2',
          type: 'pension',
          providerName: 'Provider B',
          accountName: 'Account 2',
          currentValue: 75000,
          feeFromDeposit: 0.03,
          feeFromTotal: 0.004,
          deposits: [
            {
              id: 'deposit-2',
              depositDate: new Date('2024-01-15'),
              salaryMonth: currentMonth,
              amount: 4000,
              employer: 'Company B',
            },
          ],
          owners: [],
        },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(data.data.totalValue).toBe(125000);
      expect(data.data.totalDeposits).toBe(7000);
      expect(data.data.thisMonthDeposits).toBe(7000);
      expect(data.data.accountsCount).toBe(2);
    });

    it('handles database error', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      mockPrisma.pensionAccount.findMany.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch pension data');

      consoleErrorSpy.mockRestore();
    });
  });
});
