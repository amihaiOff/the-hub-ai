/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    stockHolding: {
      findMany: jest.fn(),
    },
    pensionAccount: {
      findMany: jest.fn(),
    },
    household: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    stockAccount: {
      findMany: jest.fn(),
    },
    miscAsset: {
      findMany: jest.fn(),
    },
  },
}));

// Mock stock-price module
jest.mock('@/lib/api/stock-price', () => ({
  updateStockPriceCache: jest.fn(),
  isStockPriceError: jest.fn((result) => 'error' in result),
  getStockPrices: jest.fn(),
}));

import { GET as dailyTasksGET } from '../daily-tasks/route';
import { GET as createSnapshotGET } from '../create-snapshot/route';
import { prisma } from '@/lib/db';
import { updateStockPriceCache, getStockPrices } from '@/lib/api/stock-price';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockUpdateStockPriceCache = updateStockPriceCache as jest.MockedFunction<
  typeof updateStockPriceCache
>;
const mockGetStockPrices = getStockPrices as jest.MockedFunction<typeof getStockPrices>;

// Store original NODE_ENV
const originalNodeEnv = process.env.NODE_ENV;

describe('Daily Tasks Cron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    // Restore NODE_ENV after production tests
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
    });
  });

  describe('GET /api/cron/daily-tasks', () => {
    it('should update stock prices for all holdings', async () => {
      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'GOOGL' },
      ]);

      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);

      mockUpdateStockPriceCache.mockResolvedValue({
        symbol: 'AAPL',
        price: 150,
        timestamp: new Date(),
        fromCache: false,
      });

      const request = new NextRequest('http://localhost/api/cron/daily-tasks');
      const response = await dailyTasksGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results.stockPrices.updated).toBe(2);
      expect(mockUpdateStockPriceCache).toHaveBeenCalledTimes(2);
    });

    it('should handle stock price update failures', async () => {
      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValue([{ symbol: 'INVALID' }]);

      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);

      mockUpdateStockPriceCache.mockResolvedValue({
        symbol: 'INVALID',
        error: 'Failed to fetch price',
      });

      const request = new NextRequest('http://localhost/api/cron/daily-tasks');
      const response = await dailyTasksGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results.stockPrices.failed).toBe(1);
    });

    it('should check for missing pension deposits', async () => {
      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValue([]);

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'account-1',
          deposits: [
            {
              salaryMonth: threeMonthsAgo,
              amount: { toNumber: () => 5000 },
            },
          ],
        },
      ]);

      const request = new NextRequest('http://localhost/api/cron/daily-tasks');
      const response = await dailyTasksGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results.notifications.checked).toBe(1);
      expect(data.results.notifications.created).toBe(1);
    });

    it('should detect deposit amount anomalies', async () => {
      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValue([]);

      const now = new Date();
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'account-1',
          deposits: [
            { salaryMonth: now, amount: { toNumber: () => 10000 } }, // 100% increase
            { salaryMonth: now, amount: { toNumber: () => 5000 } },
            { salaryMonth: now, amount: { toNumber: () => 5000 } },
            { salaryMonth: now, amount: { toNumber: () => 5000 } },
          ],
        },
      ]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const request = new NextRequest('http://localhost/api/cron/daily-tasks');
      await dailyTasksGET(request);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Deposit anomaly'));
      consoleSpy.mockRestore();
    });

    it('should require authorization in production', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
      });
      process.env.CRON_SECRET = 'test-secret';

      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);

      // Without auth header
      const request = new NextRequest('http://localhost/api/cron/daily-tasks');
      const response = await dailyTasksGET(request);

      expect(response.status).toBe(401);

      // With correct auth header
      const authRequest = new NextRequest('http://localhost/api/cron/daily-tasks', {
        headers: { authorization: 'Bearer test-secret' },
      });
      const authResponse = await dailyTasksGET(authRequest);

      expect(authResponse.status).toBe(200);
    });

    it('should handle database errors gracefully', async () => {
      (mockPrisma.stockHolding.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const request = new NextRequest('http://localhost/api/cron/daily-tasks');
      const response = await dailyTasksGET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});

describe('Create Snapshot Cron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    // Restore NODE_ENV after production tests
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      writable: true,
    });
  });

  describe('GET /api/cron/create-snapshot', () => {
    it('should create snapshots for households', async () => {
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'household-1',
          name: 'Test Family',
          members: [{ profileId: 'profile-1', profile: { id: 'profile-1' } }],
        },
      ]);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValue([
        {
          holdings: [{ symbol: 'AAPL', quantity: { toNumber: () => 10 } }],
        },
      ]);

      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([
        { currentValue: { toNumber: () => 50000 } },
      ]);

      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValue([
        { currentValue: { toNumber: () => 10000 } },
      ]);

      mockGetStockPrices.mockResolvedValue(
        new Map([['AAPL', { symbol: 'AAPL', price: 150, timestamp: new Date(), fromCache: true }]])
      );

      const request = new NextRequest('http://localhost/api/cron/create-snapshot');
      const response = await createSnapshotGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.snapshots).toHaveLength(1);
      expect(data.snapshots[0].householdName).toBe('Test Family');
      // 10 shares * $150 + $50000 pension + $10000 misc = $61500
      expect(data.snapshots[0].netWorth).toBe(61500);
    });

    it('should handle users without households', async () => {
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([]);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'user-1',
          name: 'Solo User',
          email: 'solo@test.com',
          profile: { id: 'profile-solo' },
        },
      ]);

      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValue([]);
      mockGetStockPrices.mockResolvedValue(new Map());

      const request = new NextRequest('http://localhost/api/cron/create-snapshot');
      const response = await createSnapshotGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.snapshots).toHaveLength(1);
      expect(data.snapshots[0].userName).toBe('Solo User');
    });

    it('should require authorization in production', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
      });
      process.env.CRON_SECRET = 'test-secret';

      const request = new NextRequest('http://localhost/api/cron/create-snapshot');
      const response = await createSnapshotGET(request);

      expect(response.status).toBe(401);
    });

    it('should handle errors gracefully', async () => {
      (mockPrisma.household.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/cron/create-snapshot');
      const response = await createSnapshotGET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should skip stocks with price errors', async () => {
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'household-1',
          name: 'Test Family',
          members: [{ profileId: 'profile-1', profile: { id: 'profile-1' } }],
        },
      ]);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValue([
        {
          holdings: [{ symbol: 'INVALID', quantity: { toNumber: () => 10 } }],
        },
      ]);

      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValue([]);

      mockGetStockPrices.mockResolvedValue(
        new Map([['INVALID', { symbol: 'INVALID', error: 'Not found' }]])
      );

      const request = new NextRequest('http://localhost/api/cron/create-snapshot');
      const response = await createSnapshotGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.snapshots[0].netWorth).toBe(0);
    });

    it('should allow access with correct auth in production', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
      });
      process.env.CRON_SECRET = 'test-cron-secret';

      (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/cron/create-snapshot', {
        headers: { authorization: 'Bearer test-cron-secret' },
      });
      const response = await createSnapshotGET(request);

      expect(response.status).toBe(200);
    });

    it('should skip users without profile', async () => {
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([]);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'user-no-profile',
          name: 'No Profile User',
          email: 'no-profile@test.com',
          profile: null, // User has no profile
        },
        {
          id: 'user-with-profile',
          name: 'Has Profile',
          email: 'has-profile@test.com',
          profile: { id: 'profile-with' },
        },
      ]);

      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValue([]);
      mockGetStockPrices.mockResolvedValue(new Map());

      const request = new NextRequest('http://localhost/api/cron/create-snapshot');
      const response = await createSnapshotGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should only have 1 snapshot (for user with profile)
      expect(data.snapshots).toHaveLength(1);
      expect(data.snapshots[0].userName).toBe('Has Profile');
    });

    it('should use email when user has no name', async () => {
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValue([]);

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'user-1',
          name: null, // No name
          email: 'email-only@test.com',
          profile: { id: 'profile-1' },
        },
      ]);

      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValue([]);
      mockGetStockPrices.mockResolvedValue(new Map());

      const request = new NextRequest('http://localhost/api/cron/create-snapshot');
      const response = await createSnapshotGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.snapshots[0].userName).toBe('email-only@test.com');
    });
  });
});
