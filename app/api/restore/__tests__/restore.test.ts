/**
 * Integration tests for /api/restore route
 * Tests database restore from backup ZIP file with authentication
 */

import { NextRequest } from 'next/server';
import JSZip from 'jszip';

// Mock Prisma client with transaction support
const mockTransaction = jest.fn();
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mockTransaction,
    user: { deleteMany: jest.fn(), createMany: jest.fn() },
    profile: { deleteMany: jest.fn(), createMany: jest.fn() },
    household: { deleteMany: jest.fn(), createMany: jest.fn() },
    householdMember: { deleteMany: jest.fn(), createMany: jest.fn() },
    stockAccount: { deleteMany: jest.fn(), createMany: jest.fn() },
    stockAccountOwner: { deleteMany: jest.fn(), createMany: jest.fn() },
    stockHolding: { deleteMany: jest.fn(), createMany: jest.fn() },
    stockPriceHistory: { deleteMany: jest.fn(), createMany: jest.fn() },
    pensionAccount: { deleteMany: jest.fn(), createMany: jest.fn() },
    pensionAccountOwner: { deleteMany: jest.fn(), createMany: jest.fn() },
    pensionDeposit: { deleteMany: jest.fn(), createMany: jest.fn() },
    miscAsset: { deleteMany: jest.fn(), createMany: jest.fn() },
    miscAssetOwner: { deleteMany: jest.fn(), createMany: jest.fn() },
    netWorthSnapshot: { deleteMany: jest.fn(), createMany: jest.fn() },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentUser: jest.fn(),
}));

import { getCurrentUser } from '@/lib/auth-utils';
import { POST } from '../route';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

/**
 * Helper to create a valid backup ZIP file
 */
async function createBackupZip(
  metadata: object,
  data: Record<string, unknown[]> = {}
): Promise<Blob> {
  const zip = new JSZip();

  zip.file('metadata.json', JSON.stringify(metadata));

  // Add default empty arrays for all tables
  const defaultData: Record<string, unknown[]> = {
    users: [],
    profiles: [],
    households: [],
    household_members: [],
    stock_accounts: [],
    stock_account_owners: [],
    stock_holdings: [],
    stock_price_history: [],
    pension_accounts: [],
    pension_account_owners: [],
    pension_deposits: [],
    misc_assets: [],
    misc_asset_owners: [],
    net_worth_snapshots: [],
    ...data,
  };

  for (const [filename, content] of Object.entries(defaultData)) {
    zip.file(`${filename}.json`, JSON.stringify(content));
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Helper to create FormData with file
 */
function createFormData(blob: Blob, filename: string = 'backup.zip'): FormData {
  const formData = new FormData();
  formData.append('file', new File([blob], filename, { type: 'application/zip' }));
  return formData;
}

describe('Restore API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default: transaction executes callback successfully
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
      const mockTx = {
        user: { deleteMany: jest.fn(), createMany: jest.fn() },
        profile: { deleteMany: jest.fn(), createMany: jest.fn() },
        household: { deleteMany: jest.fn(), createMany: jest.fn() },
        householdMember: { deleteMany: jest.fn(), createMany: jest.fn() },
        stockAccount: { deleteMany: jest.fn(), createMany: jest.fn() },
        stockAccountOwner: { deleteMany: jest.fn(), createMany: jest.fn() },
        stockHolding: { deleteMany: jest.fn(), createMany: jest.fn() },
        stockPriceHistory: { deleteMany: jest.fn(), createMany: jest.fn() },
        pensionAccount: { deleteMany: jest.fn(), createMany: jest.fn() },
        pensionAccountOwner: { deleteMany: jest.fn(), createMany: jest.fn() },
        pensionDeposit: { deleteMany: jest.fn(), createMany: jest.fn() },
        miscAsset: { deleteMany: jest.fn(), createMany: jest.fn() },
        miscAssetOwner: { deleteMany: jest.fn(), createMany: jest.fn() },
        netWorthSnapshot: { deleteMany: jest.fn(), createMany: jest.fn() },
      };
      await callback(mockTx);
    });
  });

  describe('POST /api/restore', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValueOnce(null);

      const blob = await createBackupZip({ schemaVersion: '1.0', backupDate: '2024-01-01' });
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when no file is uploaded', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const formData = new FormData();
      // No file added

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('No file uploaded');
    });

    it('should return 400 when metadata.json is missing', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Create ZIP without metadata
      const zip = new JSZip();
      zip.file('users.json', '[]');
      const blob = await zip.generateAsync({ type: 'blob' });
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid backup: missing metadata.json');
    });

    it('should return 400 for unsupported schema version', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const blob = await createBackupZip({
        schemaVersion: '2.0', // Unsupported version
        backupDate: '2024-01-01',
      });
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unsupported schema version: 2.0');
    });

    it('should restore empty backup successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const metadata = {
        schemaVersion: '1.0',
        backupDate: '2024-01-01T00:00:00.000Z',
        createdBy: 'test@example.com',
        counts: { users: 0 },
      };

      const blob = await createBackupZip(metadata);
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Database restored successfully');
      expect(data.metadata.backupDate).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should restore backup with all data types', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const metadata = {
        schemaVersion: '1.0',
        backupDate: '2024-01-15T12:00:00.000Z',
        createdBy: 'test@example.com',
        counts: {
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
        },
      };

      const data = {
        users: [
          {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            image: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        profiles: [
          {
            id: 'profile-1',
            name: 'Test Profile',
            image: null,
            color: '#3b82f6',
            userId: 'user-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        households: [
          {
            id: 'household-1',
            name: 'Test Household',
            description: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        household_members: [
          {
            id: 'member-1',
            householdId: 'household-1',
            profileId: 'profile-1',
            role: 'owner',
            joinedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        stock_accounts: [
          {
            id: 'account-1',
            name: 'Brokerage',
            broker: 'Fidelity',
            currency: 'USD',
            userId: 'user-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        stock_account_owners: [{ id: 'owner-1', accountId: 'account-1', profileId: 'profile-1' }],
        stock_holdings: [
          {
            id: 'holding-1',
            symbol: 'AAPL',
            quantity: 10,
            avgCostBasis: 150,
            accountId: 'account-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        stock_price_history: [
          {
            id: 'price-1',
            symbol: 'AAPL',
            price: 175,
            timestamp: '2024-01-15T00:00:00.000Z',
          },
        ],
        pension_accounts: [
          {
            id: 'pension-1',
            type: 'pension',
            providerName: 'Meitav',
            accountName: 'My Pension',
            currentValue: 50000,
            feeFromDeposit: 0.03,
            feeFromTotal: 0.005,
            userId: 'user-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        pension_account_owners: [
          { id: 'pension-owner-1', accountId: 'pension-1', profileId: 'profile-1' },
        ],
        pension_deposits: [
          {
            id: 'deposit-1',
            depositDate: '2024-01-15',
            salaryMonth: '2024-01-01',
            amount: 5000,
            employer: 'TechCorp',
            accountId: 'pension-1',
            createdAt: '2024-01-15T00:00:00.000Z',
          },
        ],
        misc_assets: [
          {
            id: 'asset-1',
            type: 'bank_deposit',
            name: 'Savings',
            currentValue: 10000,
            interestRate: 0.035,
            monthlyPayment: null,
            monthlyDeposit: null,
            maturityDate: '2025-01-01',
            userId: 'user-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        misc_asset_owners: [{ id: 'misc-owner-1', assetId: 'asset-1', profileId: 'profile-1' }],
        net_worth_snapshots: [
          {
            id: 'snapshot-1',
            userId: 'user-1',
            date: '2024-01-01',
            netWorth: 61500,
            portfolio: 1500,
            pension: 50000,
            assets: 10000,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const blob = await createBackupZip(metadata, data);
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
    });

    it('should handle transaction errors and rollback', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Simulate transaction failure
      mockTransaction.mockRejectedValueOnce(new Error('Database constraint violation'));

      const metadata = {
        schemaVersion: '1.0',
        backupDate: '2024-01-01T00:00:00.000Z',
        createdBy: 'test@example.com',
        counts: { users: 1 },
      };

      const data = {
        users: [
          {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            image: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const blob = await createBackupZip(metadata, data);
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(500);
      expect(responseData.success).toBe(false);
      expect(responseData.error).toBe('Database constraint violation');
    });

    it('should handle malformed JSON in backup files', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const zip = new JSZip();
      zip.file('metadata.json', JSON.stringify({ schemaVersion: '1.0', backupDate: '2024-01-01' }));
      zip.file('users.json', 'not valid json{{{');

      const blob = await zip.generateAsync({ type: 'blob' });
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    it('should handle missing optional data files gracefully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Create ZIP with only metadata and some required files
      const zip = new JSZip();
      zip.file(
        'metadata.json',
        JSON.stringify({
          schemaVersion: '1.0',
          backupDate: '2024-01-01T00:00:00.000Z',
          createdBy: 'test@example.com',
          counts: { users: 0 },
        })
      );
      // Missing most data files - should default to empty arrays

      const blob = await zip.generateAsync({ type: 'blob' });
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should delete data in correct order to avoid foreign key violations', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const deleteOrder: string[] = [];

      mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
        const mockTx = {
          user: {
            deleteMany: jest.fn(() => deleteOrder.push('user')),
            createMany: jest.fn(),
          },
          profile: {
            deleteMany: jest.fn(() => deleteOrder.push('profile')),
            createMany: jest.fn(),
          },
          household: {
            deleteMany: jest.fn(() => deleteOrder.push('household')),
            createMany: jest.fn(),
          },
          householdMember: {
            deleteMany: jest.fn(() => deleteOrder.push('householdMember')),
            createMany: jest.fn(),
          },
          stockAccount: {
            deleteMany: jest.fn(() => deleteOrder.push('stockAccount')),
            createMany: jest.fn(),
          },
          stockAccountOwner: {
            deleteMany: jest.fn(() => deleteOrder.push('stockAccountOwner')),
            createMany: jest.fn(),
          },
          stockHolding: {
            deleteMany: jest.fn(() => deleteOrder.push('stockHolding')),
            createMany: jest.fn(),
          },
          stockPriceHistory: {
            deleteMany: jest.fn(() => deleteOrder.push('stockPriceHistory')),
            createMany: jest.fn(),
          },
          pensionAccount: {
            deleteMany: jest.fn(() => deleteOrder.push('pensionAccount')),
            createMany: jest.fn(),
          },
          pensionAccountOwner: {
            deleteMany: jest.fn(() => deleteOrder.push('pensionAccountOwner')),
            createMany: jest.fn(),
          },
          pensionDeposit: {
            deleteMany: jest.fn(() => deleteOrder.push('pensionDeposit')),
            createMany: jest.fn(),
          },
          miscAsset: {
            deleteMany: jest.fn(() => deleteOrder.push('miscAsset')),
            createMany: jest.fn(),
          },
          miscAssetOwner: {
            deleteMany: jest.fn(() => deleteOrder.push('miscAssetOwner')),
            createMany: jest.fn(),
          },
          netWorthSnapshot: {
            deleteMany: jest.fn(() => deleteOrder.push('netWorthSnapshot')),
            createMany: jest.fn(),
          },
        };
        await callback(mockTx);
      });

      const metadata = {
        schemaVersion: '1.0',
        backupDate: '2024-01-01T00:00:00.000Z',
        createdBy: 'test@example.com',
        counts: {},
      };

      const blob = await createBackupZip(metadata);
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      // Verify children are deleted before parents
      // Net worth snapshots, price history, holdings -> accounts -> users
      const netWorthIndex = deleteOrder.indexOf('netWorthSnapshot');
      const stockHoldingIndex = deleteOrder.indexOf('stockHolding');
      const stockAccountOwnerIndex = deleteOrder.indexOf('stockAccountOwner');
      const stockAccountIndex = deleteOrder.indexOf('stockAccount');
      const userIndex = deleteOrder.indexOf('user');

      expect(netWorthIndex).toBeLessThan(userIndex);
      expect(stockHoldingIndex).toBeLessThan(stockAccountIndex);
      expect(stockAccountOwnerIndex).toBeLessThan(stockAccountIndex);
    });

    it('should insert data in correct order to respect foreign keys', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const insertOrder: string[] = [];

      mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => {
        const mockTx = {
          user: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('user')),
          },
          profile: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('profile')),
          },
          household: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('household')),
          },
          householdMember: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('householdMember')),
          },
          stockAccount: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('stockAccount')),
          },
          stockAccountOwner: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('stockAccountOwner')),
          },
          stockHolding: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('stockHolding')),
          },
          stockPriceHistory: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('stockPriceHistory')),
          },
          pensionAccount: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('pensionAccount')),
          },
          pensionAccountOwner: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('pensionAccountOwner')),
          },
          pensionDeposit: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('pensionDeposit')),
          },
          miscAsset: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('miscAsset')),
          },
          miscAssetOwner: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('miscAssetOwner')),
          },
          netWorthSnapshot: {
            deleteMany: jest.fn(),
            createMany: jest.fn(() => insertOrder.push('netWorthSnapshot')),
          },
        };
        await callback(mockTx);
      });

      const metadata = {
        schemaVersion: '1.0',
        backupDate: '2024-01-01T00:00:00.000Z',
        createdBy: 'test@example.com',
        counts: {},
      };

      const data = {
        users: [
          {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test',
            image: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        profiles: [
          {
            id: 'profile-1',
            name: 'Test',
            image: null,
            color: '#000',
            userId: 'user-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        households: [
          {
            id: 'household-1',
            name: 'Test',
            description: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        household_members: [
          {
            id: 'member-1',
            householdId: 'household-1',
            profileId: 'profile-1',
            role: 'owner',
            joinedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        stock_accounts: [
          {
            id: 'account-1',
            name: 'Test',
            broker: null,
            currency: 'USD',
            userId: 'user-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        stock_account_owners: [{ id: 'owner-1', accountId: 'account-1', profileId: 'profile-1' }],
        stock_holdings: [
          {
            id: 'holding-1',
            symbol: 'AAPL',
            quantity: 10,
            avgCostBasis: 150,
            accountId: 'account-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const blob = await createBackupZip(metadata, data);
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      // Verify parents are inserted before children
      const userIndex = insertOrder.indexOf('user');
      const profileIndex = insertOrder.indexOf('profile');
      const householdIndex = insertOrder.indexOf('household');
      const householdMemberIndex = insertOrder.indexOf('householdMember');
      const stockAccountIndex = insertOrder.indexOf('stockAccount');
      const stockAccountOwnerIndex = insertOrder.indexOf('stockAccountOwner');
      const stockHoldingIndex = insertOrder.indexOf('stockHolding');

      expect(userIndex).toBeLessThan(profileIndex);
      expect(profileIndex).toBeLessThan(householdMemberIndex);
      expect(householdIndex).toBeLessThan(householdMemberIndex);
      expect(stockAccountIndex).toBeLessThan(stockAccountOwnerIndex);
      expect(stockAccountIndex).toBeLessThan(stockHoldingIndex);
    });
  });
});
