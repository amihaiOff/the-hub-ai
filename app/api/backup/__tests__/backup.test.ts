/**
 * Integration tests for /api/backup route
 * Tests database backup creation with authentication
 */

import JSZip from 'jszip';

// Simple Decimal mock that mimics Prisma Decimal behavior
const createDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => String(value),
  valueOf: () => value,
  toFixed: (digits?: number) => value.toFixed(digits),
});

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    profile: { findMany: jest.fn() },
    household: { findMany: jest.fn() },
    householdMember: { findMany: jest.fn() },
    stockAccount: { findMany: jest.fn() },
    stockAccountOwner: { findMany: jest.fn() },
    stockHolding: { findMany: jest.fn() },
    stockPriceHistory: { findMany: jest.fn() },
    pensionAccount: { findMany: jest.fn() },
    pensionAccountOwner: { findMany: jest.fn() },
    pensionDeposit: { findMany: jest.fn() },
    miscAsset: { findMany: jest.fn() },
    miscAssetOwner: { findMany: jest.fn() },
    netWorthSnapshot: { findMany: jest.fn() },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth-utils';
import { GET } from '../route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Backup API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/backup', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should create a valid ZIP file with all database tables', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Mock all database tables with sample data
      const mockUsers = [
        {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          image: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockProfiles = [
        {
          id: 'profile-1',
          name: 'Test Profile',
          image: null,
          color: '#3b82f6',
          userId: 'user-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockHouseholds = [
        {
          id: 'household-1',
          name: 'Test Household',
          description: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockHouseholdMembers = [
        {
          id: 'member-1',
          householdId: 'household-1',
          profileId: 'profile-1',
          role: 'owner',
          joinedAt: new Date('2024-01-01'),
        },
      ];
      const mockStockAccounts = [
        {
          id: 'stock-account-1',
          name: 'Brokerage',
          broker: 'Fidelity',
          currency: 'USD',
          userId: 'user-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockStockAccountOwners = [
        { id: 'owner-1', accountId: 'stock-account-1', profileId: 'profile-1' },
      ];
      const mockStockHoldings = [
        {
          id: 'holding-1',
          symbol: 'AAPL',
          quantity: createDecimal(10),
          avgCostBasis: createDecimal(150),
          accountId: 'stock-account-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockStockPriceHistory = [
        {
          id: 'price-1',
          symbol: 'AAPL',
          price: createDecimal(175),
          timestamp: new Date('2024-01-15'),
        },
      ];
      const mockPensionAccounts = [
        {
          id: 'pension-1',
          type: 'pension',
          providerName: 'Meitav',
          accountName: 'My Pension',
          currentValue: createDecimal(50000),
          feeFromDeposit: createDecimal(0.03),
          feeFromTotal: createDecimal(0.005),
          userId: 'user-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockPensionAccountOwners = [
        { id: 'pension-owner-1', accountId: 'pension-1', profileId: 'profile-1' },
      ];
      const mockPensionDeposits = [
        {
          id: 'deposit-1',
          depositDate: new Date('2024-01-15'),
          salaryMonth: new Date('2024-01-01'),
          amount: createDecimal(5000),
          employer: 'TechCorp',
          accountId: 'pension-1',
          createdAt: new Date('2024-01-15'),
        },
      ];
      const mockMiscAssets = [
        {
          id: 'asset-1',
          type: 'bank_deposit',
          name: 'Savings',
          currentValue: createDecimal(10000),
          interestRate: createDecimal(0.035),
          monthlyPayment: null,
          monthlyDeposit: null,
          maturityDate: new Date('2025-01-01'),
          userId: 'user-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockMiscAssetOwners = [
        { id: 'misc-owner-1', assetId: 'asset-1', profileId: 'profile-1' },
      ];
      const mockNetWorthSnapshots = [
        {
          id: 'snapshot-1',
          userId: 'user-1',
          date: new Date('2024-01-01'),
          netWorth: createDecimal(61500),
          portfolio: createDecimal(1500),
          pension: createDecimal(50000),
          assets: createDecimal(10000),
          createdAt: new Date('2024-01-01'),
        },
      ];

      // Set up all mocks
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValueOnce(mockUsers);
      (mockPrisma.profile.findMany as jest.Mock).mockResolvedValueOnce(mockProfiles);
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce(mockHouseholds);
      (mockPrisma.householdMember.findMany as jest.Mock).mockResolvedValueOnce(
        mockHouseholdMembers
      );
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockStockAccounts);
      (mockPrisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(
        mockStockAccountOwners
      );
      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValueOnce(mockStockHoldings);
      (mockPrisma.stockPriceHistory.findMany as jest.Mock).mockResolvedValueOnce(
        mockStockPriceHistory
      );
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce(mockPensionAccounts);
      (mockPrisma.pensionAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(
        mockPensionAccountOwners
      );
      (mockPrisma.pensionDeposit.findMany as jest.Mock).mockResolvedValueOnce(mockPensionDeposits);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockMiscAssets);
      (mockPrisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(mockMiscAssetOwners);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(
        mockNetWorthSnapshots
      );

      const response = await GET();

      // Verify response headers
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/zip');
      expect(response.headers.get('Content-Disposition')).toMatch(
        /attachment; filename="hub-ai-backup-\d{4}-\d{2}-\d{2}\.zip"/
      );

      // Parse and verify ZIP contents
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Check all expected files exist
      expect(zip.file('metadata.json')).not.toBeNull();
      expect(zip.file('users.json')).not.toBeNull();
      expect(zip.file('profiles.json')).not.toBeNull();
      expect(zip.file('households.json')).not.toBeNull();
      expect(zip.file('household_members.json')).not.toBeNull();
      expect(zip.file('stock_accounts.json')).not.toBeNull();
      expect(zip.file('stock_account_owners.json')).not.toBeNull();
      expect(zip.file('stock_holdings.json')).not.toBeNull();
      expect(zip.file('stock_price_history.json')).not.toBeNull();
      expect(zip.file('pension_accounts.json')).not.toBeNull();
      expect(zip.file('pension_account_owners.json')).not.toBeNull();
      expect(zip.file('pension_deposits.json')).not.toBeNull();
      expect(zip.file('misc_assets.json')).not.toBeNull();
      expect(zip.file('misc_asset_owners.json')).not.toBeNull();
      expect(zip.file('net_worth_snapshots.json')).not.toBeNull();

      // Verify metadata content
      const metadataContent = await zip.file('metadata.json')!.async('string');
      const metadata = JSON.parse(metadataContent);
      expect(metadata.schemaVersion).toBe('1.0');
      expect(metadata.createdBy).toBe('test@example.com');
      expect(metadata.counts).toEqual({
        users: 1,
        profiles: 1,
        households: 1,
        householdMembers: 1,
        stockAccounts: 1,
        stockAccountOwners: 1,
        stockHoldings: 1,
        stockPriceHistory: 1,
        pensionAccounts: 1,
        pensionAccountOwners: 1,
        pensionDeposits: 1,
        miscAssets: 1,
        miscAssetOwners: 1,
        netWorthSnapshots: 1,
      });

      // Verify data files contain correct data
      const usersContent = await zip.file('users.json')!.async('string');
      const users = JSON.parse(usersContent);
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('test@example.com');

      const holdingsContent = await zip.file('stock_holdings.json')!.async('string');
      const holdings = JSON.parse(holdingsContent);
      expect(holdings).toHaveLength(1);
      expect(holdings[0].symbol).toBe('AAPL');
      expect(holdings[0].quantity).toBe('10'); // Decimal converted to string for precision
    });

    it('should handle empty database tables', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Mock all tables as empty
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.profile.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.householdMember.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockPriceHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccountOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionDeposit.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();

      expect(response.status).toBe(200);

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const metadataContent = await zip.file('metadata.json')!.async('string');
      const metadata = JSON.parse(metadataContent);

      expect(metadata.counts.users).toBe(0);
      expect(metadata.counts.profiles).toBe(0);
      expect(metadata.counts.households).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Simulate database error
      (mockPrisma.user.findMany as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create backup');
    });

    it('should serialize Decimal values correctly', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Set up minimal mocks with Decimal values
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.profile.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.householdMember.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockAccountOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.stockHolding.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'holding-1',
          symbol: 'TSLA',
          quantity: createDecimal(5.5),
          avgCostBasis: createDecimal(200.25),
          accountId: 'account-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      (mockPrisma.stockPriceHistory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccountOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionDeposit.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const holdingsContent = await zip.file('stock_holdings.json')!.async('string');
      const holdings = JSON.parse(holdingsContent);

      // Verify Decimal values are converted to strings (for precision)
      expect(typeof holdings[0].quantity).toBe('string');
      expect(holdings[0].quantity).toBe('5.5');
      expect(holdings[0].avgCostBasis).toBe('200.25');
    });
  });
});
