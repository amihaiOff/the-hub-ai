/**
 * Integration tests for /api/restore route
 * Tests database restore from backup ZIP file with authentication
 */

import { NextRequest } from 'next/server';
import JSZip from 'jszip';

// Track operation order for testing
const operationOrder: string[] = [];

// Track which models have been created (to record only first create per model)
const createdModels = new Set<string>();

// Helper to create mock functions that track operations
// Note: Using individual create calls instead of createMany for Neon compatibility
const createMockFns = (name: string) => ({
  deleteMany: jest.fn().mockImplementation(() => operationOrder.push(`delete:${name}`)),
  createMany: jest.fn().mockImplementation(() => operationOrder.push(`createMany:${name}`)),
  // Track only the first create per model to verify ordering
  create: jest.fn().mockImplementation(() => {
    if (!createdModels.has(name)) {
      operationOrder.push(`create:${name}`);
      createdModels.add(name);
    }
    return { id: 'mock-id' };
  }),
});

// Mock Prisma client - no transaction (Neon serverless compatible)
const mockPrisma = {
  user: createMockFns('user'),
  profile: createMockFns('profile'),
  household: createMockFns('household'),
  householdMember: createMockFns('householdMember'),
  stockAccount: createMockFns('stockAccount'),
  stockAccountOwner: createMockFns('stockAccountOwner'),
  stockHolding: createMockFns('stockHolding'),
  stockAccountCash: createMockFns('stockAccountCash'),
  stockPriceHistory: createMockFns('stockPriceHistory'),
  pensionAccount: createMockFns('pensionAccount'),
  pensionAccountOwner: createMockFns('pensionAccountOwner'),
  pensionDeposit: createMockFns('pensionDeposit'),
  miscAsset: createMockFns('miscAsset'),
  miscAssetOwner: createMockFns('miscAssetOwner'),
  mortgageTrack: createMockFns('mortgageTrack'),
  netWorthSnapshot: createMockFns('netWorthSnapshot'),
  budgetCategoryGroup: createMockFns('budgetCategoryGroup'),
  budgetCategory: createMockFns('budgetCategory'),
  budgetPayee: createMockFns('budgetPayee'),
  budgetTag: createMockFns('budgetTag'),
  budgetTransaction: { ...createMockFns('budgetTransaction'), update: jest.fn() },
  budgetTransactionTag: createMockFns('budgetTransactionTag'),
  riseupCategory: createMockFns('riseupCategory'),
  payeeCategoryRule: createMockFns('payeeCategoryRule'),
  insurancePolicy: createMockFns('insurancePolicy'),
  shoppingCategory: createMockFns('shoppingCategory'),
  shoppingItem: createMockFns('shoppingItem'),
  shoppingCartItem: createMockFns('shoppingCartItem'),
  shoppingDelivery: createMockFns('shoppingDelivery'),
  moneytorStockHolding: createMockFns('moneytorStockHolding'),
  moneytorStockSnapshot: createMockFns('moneytorStockSnapshot'),
  moneytorAccount: createMockFns('moneytorAccount'),
  moneytorAccountSnapshot: createMockFns('moneytorAccountSnapshot'),
  moneytorPensionFund: createMockFns('moneytorPensionFund'),
  moneytorPensionSnapshot: createMockFns('moneytorPensionSnapshot'),
  // Tables added to the restore round-trip in schema version 2.3.
  partnerContact: createMockFns('partnerContact'),
  ccGenericPayeeName: createMockFns('ccGenericPayeeName'),
  budgetAccountName: createMockFns('budgetAccountName'),
  generalLog: createMockFns('generalLog'),
  moneytorRealEstate: createMockFns('moneytorRealEstate'),
  moneytorRealEstateSnapshot: createMockFns('moneytorRealEstateSnapshot'),
  moneytorDropLog: createMockFns('moneytorDropLog'),
  moneytorSyncLog: createMockFns('moneytorSyncLog'),
  taskCategory: createMockFns('taskCategory'),
  taskTag: createMockFns('taskTag'),
  task: { ...createMockFns('task'), update: jest.fn() },
  taskShare: createMockFns('taskShare'),
  page: createMockFns('page'),
  pageTab: createMockFns('pageTab'),
  wikiConcept: createMockFns('wikiConcept'),
  wikiConceptProject: createMockFns('wikiConceptProject'),
  wikiQuestion: createMockFns('wikiQuestion'),
  wikiQuestionAttempt: createMockFns('wikiQuestionAttempt'),
  // Tables added to the restore round-trip in schema version 2.6.
  householdInvite: createMockFns('householdInvite'),
  marketRate: createMockFns('marketRate'),
  moneytorTransaction: createMockFns('moneytorTransaction'),
  // Tables added to the restore round-trip in schema version 2.8.
  pageSection: createMockFns('pageSection'),
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
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
    stock_account_cash: [],
    stock_price_history: [],
    pension_accounts: [],
    pension_account_owners: [],
    pension_deposits: [],
    misc_assets: [],
    misc_asset_owners: [],
    mortgage_tracks: [],
    net_worth_snapshots: [],
    budget_category_groups: [],
    budget_categories: [],
    budget_payees: [],
    budget_tags: [],
    budget_transactions: [],
    budget_transaction_tags: [],
    riseup_categories: [],
    shopping_categories: [],
    shopping_items: [],
    shopping_cart_items: [],
    shopping_deliveries: [],
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
    jest.clearAllMocks();
    // Clear operation order tracking
    operationOrder.length = 0;
    createdModels.clear();
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
        schemaVersion: '9.9', // Unsupported version
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
      expect(data.error).toBe('Unsupported schema version: 9.9');
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
      // Verify data was created (using individual create calls for Neon compatibility)
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.profile.create).toHaveBeenCalled();
      expect(mockPrisma.stockAccount.create).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Simulate database error during delete
      mockPrisma.netWorthSnapshot.deleteMany.mockRejectedValueOnce(
        new Error('Database constraint violation')
      );

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

      // Extract delete operations from operationOrder
      const deleteOps = operationOrder.filter((op) => op.startsWith('delete:'));

      // Verify children are deleted before parents
      const netWorthIndex = deleteOps.indexOf('delete:netWorthSnapshot');
      const stockHoldingIndex = deleteOps.indexOf('delete:stockHolding');
      const stockAccountCashIndex = deleteOps.indexOf('delete:stockAccountCash');
      const stockAccountOwnerIndex = deleteOps.indexOf('delete:stockAccountOwner');
      const stockAccountIndex = deleteOps.indexOf('delete:stockAccount');
      const mortgageTrackIndex = deleteOps.indexOf('delete:mortgageTrack');
      const miscAssetIndex = deleteOps.indexOf('delete:miscAsset');
      const userIndex = deleteOps.indexOf('delete:user');

      expect(netWorthIndex).toBeLessThan(userIndex);
      expect(stockHoldingIndex).toBeLessThan(stockAccountIndex);
      expect(stockAccountCashIndex).toBeLessThan(stockAccountIndex);
      expect(stockAccountOwnerIndex).toBeLessThan(stockAccountIndex);
      expect(mortgageTrackIndex).toBeLessThan(miscAssetIndex);

      // Budget tables: children deleted before parents
      const budgetTransactionTagIndex = deleteOps.indexOf('delete:budgetTransactionTag');
      const budgetTransactionIndex = deleteOps.indexOf('delete:budgetTransaction');
      const budgetPayeeIndex = deleteOps.indexOf('delete:budgetPayee');
      const payeeCategoryRuleIndex = deleteOps.indexOf('delete:payeeCategoryRule');
      const budgetCategoryIndex = deleteOps.indexOf('delete:budgetCategory');
      const budgetCategoryGroupIndex = deleteOps.indexOf('delete:budgetCategoryGroup');
      const riseupCategoryIndex = deleteOps.indexOf('delete:riseupCategory');

      expect(budgetTransactionTagIndex).toBeLessThan(budgetTransactionIndex);
      expect(budgetTransactionIndex).toBeLessThan(budgetCategoryIndex);
      expect(budgetPayeeIndex).toBeLessThan(budgetCategoryIndex);
      expect(payeeCategoryRuleIndex).toBeLessThan(budgetCategoryIndex);
      expect(riseupCategoryIndex).toBeLessThan(budgetCategoryIndex);
      expect(budgetCategoryIndex).toBeLessThan(budgetCategoryGroupIndex);

      // budgetTransactionTag depends on budgetTag
      const budgetTagDeleteIndex = deleteOps.indexOf('delete:budgetTag');
      expect(budgetTransactionTagIndex).toBeLessThan(budgetTagDeleteIndex);
    });

    it('should insert data in correct order to respect foreign keys', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

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
        budget_category_groups: [
          {
            id: 'group-1',
            name: 'Housing',
            sortOrder: 0,
            householdId: 'household-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        budget_categories: [
          {
            id: 'cat-1',
            name: 'Rent',
            groupId: 'group-1',
            budget: '5000',
            isMust: true,
            sortOrder: 0,
            householdId: 'household-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        budget_payees: [
          {
            id: 'payee-1',
            name: 'Landlord',
            categoryId: 'cat-1',
            householdId: 'household-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        budget_tags: [
          {
            id: 'tag-1',
            name: 'Fixed',
            color: '#3B82F6',
            householdId: 'household-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        riseup_categories: [
          {
            id: 'riseup-1',
            name: 'שכירות',
            isDeleted: false,
            budgetCategoryId: 'cat-1',
            householdId: 'household-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        budget_transactions: [
          {
            id: 'tx-1',
            type: 'expense',
            transactionDate: '2024-01-15',
            paymentDate: null,
            amountIls: '5000',
            currency: 'ILS',
            amountOriginal: '5000',
            categoryId: 'cat-1',
            payeeId: 'payee-1',
            paymentMethod: 'bank_transfer',
            paymentNumber: null,
            totalPayments: null,
            notes: null,
            source: 'manual',
            isRecurring: true,
            isSplit: false,
            originalTransactionId: null,
            paymentIdentifier: null,
            excludedFromFlow: false,
            profileId: 'profile-1',
            householdId: 'household-1',
            createdAt: '2024-01-15T00:00:00.000Z',
            updatedAt: '2024-01-15T00:00:00.000Z',
          },
        ],
        budget_transaction_tags: [{ id: 'tt-1', transactionId: 'tx-1', tagId: 'tag-1' }],
      };

      const blob = await createBackupZip(metadata, data);
      const formData = createFormData(blob);

      const request = new NextRequest('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData,
      });

      await POST(request);

      // Extract create operations from operationOrder
      const createOps = operationOrder.filter((op) => op.startsWith('create:'));

      // Verify parents are inserted before children
      const userIndex = createOps.indexOf('create:user');
      const profileIndex = createOps.indexOf('create:profile');
      const householdIndex = createOps.indexOf('create:household');
      const householdMemberIndex = createOps.indexOf('create:householdMember');
      const stockAccountIndex = createOps.indexOf('create:stockAccount');
      const stockAccountOwnerIndex = createOps.indexOf('create:stockAccountOwner');
      const stockHoldingIndex = createOps.indexOf('create:stockHolding');

      expect(userIndex).toBeLessThan(profileIndex);
      expect(profileIndex).toBeLessThan(householdMemberIndex);
      expect(householdIndex).toBeLessThan(householdMemberIndex);
      expect(stockAccountIndex).toBeLessThan(stockAccountOwnerIndex);
      expect(stockAccountIndex).toBeLessThan(stockHoldingIndex);

      // Stock account cash after stock account
      const stockAccountCashIndex = createOps.indexOf('create:stockAccountCash');
      if (stockAccountCashIndex >= 0) {
        expect(stockAccountIndex).toBeLessThan(stockAccountCashIndex);
      }

      // Budget: parents inserted before children
      const budgetCategoryGroupIndex = createOps.indexOf('create:budgetCategoryGroup');
      const budgetCategoryIndex = createOps.indexOf('create:budgetCategory');
      const budgetPayeeIndex = createOps.indexOf('create:budgetPayee');
      const budgetTransactionIndex = createOps.indexOf('create:budgetTransaction');
      const budgetTransactionTagIndex = createOps.indexOf('create:budgetTransactionTag');
      const riseupCategoryIndex = createOps.indexOf('create:riseupCategory');

      expect(budgetCategoryGroupIndex).toBeLessThan(budgetCategoryIndex);
      expect(budgetCategoryIndex).toBeLessThan(budgetPayeeIndex);
      expect(budgetCategoryIndex).toBeLessThan(riseupCategoryIndex);
      expect(budgetCategoryIndex).toBeLessThan(budgetTransactionIndex);
      expect(budgetTransactionIndex).toBeLessThan(budgetTransactionTagIndex);

      // budgetTag must be inserted before budgetTransactionTag
      const budgetTagIndex = createOps.indexOf('create:budgetTag');
      expect(budgetTagIndex).toBeLessThan(budgetTransactionTagIndex);
    });

    it('backfills a tab from page.content when restoring a pre-2.4 backup (no page_tabs.json)', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const pageContent = { type: 'doc', content: [{ type: 'paragraph' }] };
      const metadata = {
        schemaVersion: '2.3', // predates page_tabs
        backupDate: '2024-01-01T00:00:00.000Z',
        createdBy: 'test@example.com',
        counts: {},
      };
      // A 2.3 backup carries pages but NO page_tabs.json.
      const data = {
        pages: [
          {
            id: 'page-1',
            title: 'Legacy',
            emoji: null,
            content: pageContent,
            sortOrder: 0,
            ownerId: 'user-1',
            householdId: 'household-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const blob = await createBackupZip(metadata, data);
      const formData = new FormData();
      formData.append('file', blob, 'backup.zip');
      const request = new NextRequest('http://localhost/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Exactly one tab synthesized, seeded from the page's legacy content.
      const tabCreates = (mockPrisma.pageTab.create as jest.Mock).mock.calls;
      expect(tabCreates).toHaveLength(1);
      expect(tabCreates[0][0].data.pageId).toBe('page-1');
      expect(tabCreates[0][0].data.content).toEqual(pageContent);
      expect(tabCreates[0][0].data.sortOrder).toBe(0);
    });

    it('does not backfill a tab when the backup already carries page_tabs', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const metadata = {
        schemaVersion: '2.4',
        backupDate: '2024-01-01T00:00:00.000Z',
        createdBy: 'test@example.com',
        counts: {},
      };
      const data = {
        pages: [
          {
            id: 'page-1',
            title: 'Modern',
            emoji: null,
            content: null,
            sortOrder: 0,
            ownerId: 'user-1',
            householdId: 'household-1',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        page_tabs: [
          {
            id: 'tab-1',
            pageId: 'page-1',
            title: 'Main',
            content: { type: 'doc', content: [] },
            sortOrder: 0,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const blob = await createBackupZip(metadata, data);
      const formData = new FormData();
      formData.append('file', blob, 'backup.zip');
      const request = new NextRequest('http://localhost/api/restore', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Only the explicit tab is created — no backfill for an already-tabbed page.
      const tabCreates = (mockPrisma.pageTab.create as jest.Mock).mock.calls;
      expect(tabCreates).toHaveLength(1);
      expect(tabCreates[0][0].data.id).toBe('tab-1');
    });

    it('restores wiki concepts Projects-first and nulls a dangling projectId', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const D = '2024-01-01T00:00:00.000Z';
      const metadata = {
        schemaVersion: '2.5',
        backupDate: D,
        createdBy: 'test@example.com',
        counts: {},
      };
      const concept = (over: Record<string, unknown>) => ({
        householdId: 'household-1',
        path: `p/${over.id}`,
        type: 'Source',
        title: over.id,
        description: null,
        frontmatter: {},
        body: '# Summary\n\nx',
        projectId: null,
        sourceUrl: null,
        sourceRaw: null,
        generatedBy: null,
        generatedAt: null,
        createdAt: D,
        updatedAt: D,
        ...over,
      });
      const data = {
        // Deliberately list the Source before the Project to prove the route
        // reorders Projects first for the self-referential FK.
        wiki_concepts: [
          concept({ id: 'src-1', type: 'Source', projectId: 'proj-1' }),
          concept({ id: 'proj-1', type: 'Project' }),
          concept({ id: 'src-2', type: 'Source', projectId: 'ghost' }),
        ],
        wiki_concept_projects: [
          { id: 'm-1', sourceId: 'src-1', projectId: 'proj-1', createdAt: D },
        ],
        wiki_questions: [
          {
            id: 'q-1',
            conceptId: 'src-1',
            orderIndex: 0,
            question: 'Q?',
            options: ['a', 'b', 'c', 'd'],
            correctIdx: 1,
            explanation: 'because',
            createdAt: D,
          },
        ],
      };

      const blob = await createBackupZip(metadata, data);
      const formData = new FormData();
      formData.append('file', blob, 'backup.zip');
      const response = await POST(
        new NextRequest('http://localhost/api/restore', { method: 'POST', body: formData })
      );
      expect(response.status).toBe(200);

      const conceptCreates = (mockPrisma.wikiConcept.create as jest.Mock).mock.calls;
      const orderById = conceptCreates.map((c) => c[0].data.id);
      // Project inserted before either source.
      expect(orderById.indexOf('proj-1')).toBeLessThan(orderById.indexOf('src-1'));
      expect(orderById.indexOf('proj-1')).toBeLessThan(orderById.indexOf('src-2'));
      // Valid projectId kept, dangling one nulled.
      const byId = Object.fromEntries(conceptCreates.map((c) => [c[0].data.id, c[0].data]));
      expect(byId['src-1'].projectId).toBe('proj-1');
      expect(byId['src-2'].projectId).toBeNull();
      // Join rows + questions restored.
      expect(mockPrisma.wikiConceptProject.create as jest.Mock).toHaveBeenCalledTimes(1);
      expect(mockPrisma.wikiQuestion.create as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('should restore all extended tables with optional fields present', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const D = '2024-03-01T00:00:00.000Z';
      const metadata = {
        schemaVersion: '2.2',
        backupDate: D,
        createdBy: 'test@example.com',
        counts: { moneytorAccounts: 1 },
      };

      const data = {
        stock_account_cash: [
          {
            id: 'sac1',
            accountId: 'account-1',
            currency: 'USD',
            amount: '1000',
            createdAt: D,
            updatedAt: D,
          },
        ],
        mortgage_tracks: [
          {
            id: 'mt1',
            mortgageId: 'ma1',
            name: 'Track A',
            amount: '500000',
            interestRate: '3.5',
            monthlyPayment: '2500', // present -> string branch
            maturityDate: D, // present -> Date branch
            sortOrder: 0,
            createdAt: D,
            updatedAt: D,
          },
        ],
        payee_category_rules: [
          {
            id: 'pcr1',
            name: 'Rule',
            operator: 'contains',
            value: 'rent',
            categoryId: 'cat-1', // present
            markNeverDefault: true, // present true branch
            sortOrder: 0,
            isActive: true,
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        budget_transactions: [
          {
            id: 'tx1',
            type: 'expense',
            transactionDate: D,
            paymentDate: D, // present -> Date branch
            amountIls: '5000',
            currency: 'ILS',
            amountOriginal: '5000',
            categoryId: 'cat-1',
            payeeId: 'payee-1',
            paymentMethod: 'bank_transfer',
            paymentNumber: 1,
            totalPayments: 3,
            notes: 'note',
            source: 'manual',
            isRecurring: true,
            isSplit: true,
            originalTransactionId: null,
            paymentIdentifier: 'PID',
            excludedFromFlow: false,
            isDeleted: true,
            profileId: 'profile-1',
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
          {
            // Split child referencing tx1 -> triggers the second-pass update
            id: 'tx2',
            type: 'expense',
            transactionDate: D,
            paymentDate: null,
            amountIls: '2500',
            currency: 'ILS',
            amountOriginal: '2500',
            categoryId: 'cat-1',
            payeeId: 'payee-1',
            paymentMethod: 'bank_transfer',
            paymentNumber: null,
            totalPayments: null,
            notes: null,
            source: 'manual',
            isRecurring: false,
            isSplit: false,
            originalTransactionId: 'tx1',
            paymentIdentifier: null,
            excludedFromFlow: false,
            profileId: 'profile-1',
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        shopping_categories: [
          {
            id: 'shc1',
            name: 'Dairy',
            sortOrder: 0,
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        shopping_items: [
          {
            id: 'shi1',
            name: 'Milk',
            nameHe: 'חלב',
            categoryId: 'shc1',
            isDefault: true, // present true branch
            lastPurchasedAt: D, // present -> Date branch
            warningDays: 7, // present
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        shopping_cart_items: [
          {
            id: 'sci1',
            itemId: 'shi1',
            quantity: 2,
            checked: true, // present true branch
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        shopping_deliveries: [
          { id: 'shd1', deliveredAt: D, itemCount: 5, householdId: 'household-1', createdAt: D },
        ],
        insurance_policies: [
          {
            id: 'ip1',
            profileId: 'profile-1',
            householdId: 'household-1',
            mainBranch: 'Health',
            subBranch: 'Dental',
            productType: 'HMO',
            company: 'Clal',
            insurancePeriod: '2024',
            additionalDetails: 'details',
            premiumIls: 199.9, // present -> number/string branch
            premiumType: 'monthly',
            policyNumber: 'POL-1',
            planClassification: 'A',
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_stock_holdings: [
          {
            id: 'msh1',
            productId: 'prod1',
            accountName: 'Brokerage',
            broker: 'IBKR',
            stockName: 'TSLA',
            amount: '5.5',
            purchasePrice: '200.25', // present branch
            purchaseDate: D, // present -> Date branch
            stockPrice: '300',
            currency: 'USD',
            totalWorthInBase: '6000',
            accountCash: '150', // present branch
            householdId: 'household-1',
            syncedAt: D,
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_stock_snapshots: [
          {
            id: 'mss1',
            snapshotDate: D,
            productId: 'prod1',
            accountName: 'Brokerage',
            stockName: 'TSLA',
            amount: '5.5',
            stockPrice: '300',
            currency: 'USD',
            totalWorthInBase: '6000',
            accountCash: '150', // present branch
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_accounts: [
          {
            id: 'mac1',
            productId: 'prod2',
            form: 'bank',
            name: 'Checking',
            institution: 'Bank Hapoalim',
            subtype: 'checking',
            accountNumber: '123',
            currency: 'ILS',
            balanceInBase: '25000',
            interestRate: '1.5', // present branch
            maturityDate: D, // present -> Date branch
            monthlyPayment: '500', // present branch
            customSubtitle: 'main',
            rawData: { foo: 'bar' }, // present -> object branch
            householdId: 'household-1',
            syncedAt: D,
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_account_snapshots: [
          {
            id: 'mas1',
            snapshotDate: D,
            productId: 'prod2',
            form: 'bank',
            name: 'Checking',
            balanceInBase: '25000',
            currency: 'ILS',
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_pension_funds: [
          {
            id: 'mpf1',
            productId: 'prod3',
            routeName: 'Route',
            routeCode: 'RC',
            name: 'Fund',
            institution: 'Menora',
            productType: 'pension',
            sugKupa: 1,
            sugKerenPensia: 'X',
            accountNumber: 'AN',
            accountOwner: 'A',
            fundId: 'FID',
            fundOpeningDate: D, // date() present branch
            amount: '100000',
            currency: 'ILS',
            balanceInBase: '100000',
            profitsFromLastYear: '5000', // num() present branch
            monthlyDepositEmployee: '1000',
            monthlyDepositEmployer: '1500',
            monthlyDepositSum: '2500',
            depositFrequency: 'monthly',
            employerProvisionPct: '6.5',
            compensationProvisionPct: '8.33',
            mgmtFeeFromSavings: '0.5',
            mgmtFeeFromDeposit: '2',
            projectedMonthlyPension: '9000',
            projectedSavingsWithPremiums: '2000000',
            projectedSavingsWithoutPremiums: '1500000',
            yearsToRetirement: 25,
            gilPrisha: 67,
            sumHafkadotPitsuyim: '30000',
            sumHafkadotLoPitsuyim: '70000',
            pitzuimMaasikNochechi: '10000',
            pitzuimMarkivLemas: '5000',
            gender: 'M',
            taarichLeyda: D, // date() present branch
            matsavMishpachti: 'married',
            rawData: { a: 1 }, // present -> object branch
            householdId: 'household-1',
            syncedAt: D,
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_pension_snapshots: [
          {
            id: 'mps1',
            snapshotMonth: D,
            productId: 'prod3',
            routeName: 'Route',
            name: 'Fund',
            institution: 'Menora',
            productType: 'pension',
            amount: '100000',
            balanceInBase: '100000',
            currency: 'ILS',
            monthlyDepositSum: '2500', // present branch
            profitsFromLastYear: '5000', // present branch
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
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

      // Extended tables were created.
      expect(mockPrisma.stockAccountCash.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.mortgageTrack.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.payeeCategoryRule.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.shoppingCategory.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.shoppingItem.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.shoppingCartItem.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.shoppingDelivery.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.insurancePolicy.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.moneytorStockHolding.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.moneytorStockSnapshot.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.moneytorAccount.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.moneytorAccountSnapshot.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.moneytorPensionFund.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.moneytorPensionSnapshot.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.budgetTransaction.create).toHaveBeenCalledTimes(2);

      // Second-pass update wires the split child's originalTransactionId.
      expect(mockPrisma.budgetTransaction.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.budgetTransaction.update).toHaveBeenCalledWith({
        where: { id: 'tx2' },
        data: { originalTransactionId: 'tx1' },
      });

      // Spot-check present optional values were passed through / transformed.
      const track = mockPrisma.mortgageTrack.create.mock.calls[0][0].data;
      expect(track.monthlyPayment).toBe('2500');
      expect(track.maturityDate).toBeInstanceOf(Date);

      const rule = mockPrisma.payeeCategoryRule.create.mock.calls[0][0].data;
      expect(rule.markNeverDefault).toBe(true);

      const account = mockPrisma.moneytorAccount.create.mock.calls[0][0].data;
      expect(account.rawData).toEqual({ foo: 'bar' });
      expect(account.interestRate).toBe('1.5');
      expect(account.maturityDate).toBeInstanceOf(Date);

      const fund = mockPrisma.moneytorPensionFund.create.mock.calls[0][0].data;
      expect(fund.fundOpeningDate).toBeInstanceOf(Date);
      expect(fund.monthlyDepositSum).toBe('2500');

      const item = mockPrisma.shoppingItem.create.mock.calls[0][0].data;
      expect(item.isDefault).toBe(true);
      expect(item.lastPurchasedAt).toBeInstanceOf(Date);
    });

    it('should handle extended tables with null/absent optional fields', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      const D = '2024-03-01T00:00:00.000Z';
      const metadata = {
        schemaVersion: '2.2',
        backupDate: D,
        createdBy: 'test@example.com',
        counts: {},
      };

      const data = {
        mortgage_tracks: [
          {
            id: 'mt1',
            mortgageId: 'ma1',
            name: 'Track',
            amount: '100',
            interestRate: '2',
            monthlyPayment: null, // != null false branch
            maturityDate: null, // ternary false branch
            sortOrder: 0,
            createdAt: D,
            updatedAt: D,
          },
        ],
        payee_category_rules: [
          {
            id: 'pcr1',
            name: 'Rule',
            operator: 'eq',
            value: 'x',
            categoryId: null, // ?? null branch
            // markNeverDefault omitted -> ?? false branch
            sortOrder: 0,
            isActive: false,
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        budget_payees: [
          {
            id: 'py1',
            name: 'P',
            categoryId: null, // ?? null branch
            // neverDefault omitted -> ?? false branch
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        budget_categories: [
          {
            id: 'c1',
            name: 'Misc',
            groupId: 'g1',
            budget: null, // != null false branch
            isMust: false,
            sortOrder: 0,
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        shopping_items: [
          {
            id: 'shi1',
            name: 'Item',
            // nameHe, isDefault, lastPurchasedAt, warningDays omitted -> null/false branches
            categoryId: 'shc1',
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        shopping_cart_items: [
          {
            id: 'sci1',
            itemId: 'shi1',
            quantity: 1,
            // checked omitted -> ?? false branch
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        insurance_policies: [
          {
            id: 'ip1',
            profileId: 'profile-1',
            householdId: 'household-1',
            mainBranch: 'Health',
            // optional string fields omitted, premiumIls null
            premiumIls: null,
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_stock_holdings: [
          {
            id: 'msh1',
            productId: 'prod1',
            accountName: 'Brokerage',
            // broker omitted -> ?? null
            stockName: 'TSLA',
            amount: '1',
            purchasePrice: null, // != null false branch
            purchaseDate: null, // ternary false branch
            stockPrice: '2',
            currency: 'USD',
            totalWorthInBase: '2',
            accountCash: null, // != null false branch
            householdId: 'household-1',
            syncedAt: D,
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_stock_snapshots: [
          {
            id: 'mss1',
            snapshotDate: D,
            productId: 'prod1',
            accountName: 'Brokerage',
            stockName: 'TSLA',
            amount: '1',
            stockPrice: '2',
            currency: 'USD',
            totalWorthInBase: '2',
            accountCash: null, // != null false branch
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_accounts: [
          {
            id: 'mac1',
            productId: 'prod2',
            form: 'bank',
            name: 'Acc',
            // institution/subtype/accountNumber omitted -> ?? null
            currency: 'ILS',
            balanceInBase: '10',
            interestRate: null, // != null false branch
            maturityDate: null, // ternary false branch
            monthlyPayment: null, // != null false branch
            // rawData omitted -> ?? undefined branch
            householdId: 'household-1',
            syncedAt: D,
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_pension_funds: [
          {
            id: 'mpf1',
            productId: 'prod3',
            routeName: 'Route',
            name: 'Fund',
            productType: 'pension',
            amount: '1',
            currency: 'ILS',
            balanceInBase: '1',
            // every num()/date() field omitted -> null; rawData omitted -> undefined
            householdId: 'household-1',
            syncedAt: D,
            createdAt: D,
            updatedAt: D,
          },
        ],
        moneytor_pension_snapshots: [
          {
            id: 'mps1',
            snapshotMonth: D,
            productId: 'prod3',
            routeName: 'Route',
            name: 'Fund',
            productType: 'pension',
            amount: '1',
            balanceInBase: '1',
            currency: 'ILS',
            monthlyDepositSum: null, // != null false branch
            profitsFromLastYear: null, // != null false branch
            householdId: 'household-1',
            createdAt: D,
            updatedAt: D,
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

      const track = mockPrisma.mortgageTrack.create.mock.calls[0][0].data;
      expect(track.monthlyPayment).toBeNull();
      expect(track.maturityDate).toBeNull();

      const rule = mockPrisma.payeeCategoryRule.create.mock.calls[0][0].data;
      expect(rule.markNeverDefault).toBe(false);
      expect(rule.categoryId).toBeNull();

      const payee = mockPrisma.budgetPayee.create.mock.calls[0][0].data;
      expect(payee.neverDefault).toBe(false);
      expect(payee.categoryId).toBeNull();

      const cat = mockPrisma.budgetCategory.create.mock.calls[0][0].data;
      expect(cat.budget).toBeNull();

      const item = mockPrisma.shoppingItem.create.mock.calls[0][0].data;
      expect(item.isDefault).toBe(false);
      expect(item.lastPurchasedAt).toBeNull();
      expect(item.nameHe).toBeNull();

      const cart = mockPrisma.shoppingCartItem.create.mock.calls[0][0].data;
      expect(cart.checked).toBe(false);

      const policy = mockPrisma.insurancePolicy.create.mock.calls[0][0].data;
      expect(policy.premiumIls).toBeNull();
      expect(policy.subBranch).toBeNull();

      const holding = mockPrisma.moneytorStockHolding.create.mock.calls[0][0].data;
      expect(holding.broker).toBeNull();
      expect(holding.purchasePrice).toBeNull();
      expect(holding.purchaseDate).toBeNull();
      expect(holding.accountCash).toBeNull();

      const account = mockPrisma.moneytorAccount.create.mock.calls[0][0].data;
      expect(account.interestRate).toBeNull();
      expect(account.maturityDate).toBeNull();
      expect(account.rawData).toBeUndefined();

      const fund = mockPrisma.moneytorPensionFund.create.mock.calls[0][0].data;
      expect(fund.fundOpeningDate).toBeNull();
      expect(fund.monthlyDepositSum).toBeNull();
      expect(fund.profitsFromLastYear).toBeNull();
      expect(fund.rawData).toBeUndefined();

      const snap = mockPrisma.moneytorPensionSnapshot.create.mock.calls[0][0].data;
      expect(snap.monthlyDepositSum).toBeNull();
      expect(snap.profitsFromLastYear).toBeNull();

      // No orphan update pass when nothing references an original transaction.
      expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
    });
  });
});
