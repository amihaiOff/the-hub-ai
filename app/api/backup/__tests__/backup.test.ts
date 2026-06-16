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
    pensionAccount: { findMany: jest.fn() },
    pensionAccountOwner: { findMany: jest.fn() },
    pensionDeposit: { findMany: jest.fn() },
    miscAsset: { findMany: jest.fn() },
    miscAssetOwner: { findMany: jest.fn() },
    mortgageTrack: { findMany: jest.fn() },
    netWorthSnapshot: { findMany: jest.fn() },
    budgetCategoryGroup: { findMany: jest.fn() },
    budgetCategory: { findMany: jest.fn() },
    budgetPayee: { findMany: jest.fn() },
    budgetTag: { findMany: jest.fn() },
    budgetTransaction: { findMany: jest.fn() },
    budgetTransactionTag: { findMany: jest.fn() },
    ccGenericPayeeName: { findMany: jest.fn() },
    budgetAccountName: { findMany: jest.fn() },
    partnerContact: { findMany: jest.fn() },
    riseupCategory: { findMany: jest.fn() },
    payeeCategoryRule: { findMany: jest.fn() },
    insurancePolicy: { findMany: jest.fn() },
    shoppingCategory: { findMany: jest.fn() },
    shoppingItem: { findMany: jest.fn() },
    shoppingCartItem: { findMany: jest.fn() },
    shoppingDelivery: { findMany: jest.fn() },
    moneytorStockHolding: { findMany: jest.fn() },
    moneytorStockSnapshot: { findMany: jest.fn() },
    moneytorAccount: { findMany: jest.fn() },
    moneytorAccountSnapshot: { findMany: jest.fn() },
    moneytorPensionFund: { findMany: jest.fn() },
    moneytorPensionSnapshot: { findMany: jest.fn() },
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

      const mockBudgetCategoryGroups = [
        {
          id: 'group-1',
          name: 'Housing',
          sortOrder: 0,
          householdId: 'household-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockBudgetCategories = [
        {
          id: 'cat-1',
          name: 'Rent',
          groupId: 'group-1',
          budget: createDecimal(5000),
          isMust: true,
          sortOrder: 0,
          householdId: 'household-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockBudgetPayees = [
        {
          id: 'payee-1',
          name: 'Landlord',
          categoryId: 'cat-1',
          householdId: 'household-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockBudgetTags = [
        {
          id: 'tag-1',
          name: 'Fixed',
          color: '#3B82F6',
          householdId: 'household-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];
      const mockBudgetTransactions = [
        {
          id: 'tx-1',
          type: 'expense',
          transactionDate: new Date('2024-01-15'),
          paymentDate: null,
          amountIls: createDecimal(5000),
          currency: 'ILS',
          amountOriginal: createDecimal(5000),
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
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-15'),
        },
      ];
      const mockBudgetTransactionTags = [{ id: 'tt-1', transactionId: 'tx-1', tagId: 'tag-1' }];
      const mockRiseupCategories = [
        {
          id: 'riseup-1',
          name: 'שכירות',
          isDeleted: false,
          budgetCategoryId: 'cat-1',
          householdId: 'household-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      // Set up all mocks
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValueOnce(mockUsers);
      (mockPrisma.profile.findMany as jest.Mock).mockResolvedValueOnce(mockProfiles);
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce(mockHouseholds);
      (mockPrisma.householdMember.findMany as jest.Mock).mockResolvedValueOnce(
        mockHouseholdMembers
      );
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce(mockPensionAccounts);
      (mockPrisma.pensionAccountOwner.findMany as jest.Mock).mockResolvedValueOnce(
        mockPensionAccountOwners
      );
      (mockPrisma.pensionDeposit.findMany as jest.Mock).mockResolvedValueOnce(mockPensionDeposits);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce(mockMiscAssets);
      (mockPrisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce(mockMiscAssetOwners);
      (mockPrisma.mortgageTrack.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce(
        mockNetWorthSnapshots
      );
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce(
        mockBudgetCategoryGroups
      );
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce(mockBudgetCategories);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce(mockBudgetPayees);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce(mockBudgetTags);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce(
        mockBudgetTransactions
      );
      (mockPrisma.budgetTransactionTag.findMany as jest.Mock).mockResolvedValueOnce(
        mockBudgetTransactionTags
      );
      (mockPrisma.ccGenericPayeeName.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetAccountName.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.partnerContact.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce(mockRiseupCategories);
      (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.insurancePolicy.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingDelivery.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorStockSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

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
      expect(zip.file('pension_accounts.json')).not.toBeNull();
      expect(zip.file('pension_account_owners.json')).not.toBeNull();
      expect(zip.file('pension_deposits.json')).not.toBeNull();
      expect(zip.file('misc_assets.json')).not.toBeNull();
      expect(zip.file('misc_asset_owners.json')).not.toBeNull();
      expect(zip.file('mortgage_tracks.json')).not.toBeNull();
      expect(zip.file('net_worth_snapshots.json')).not.toBeNull();
      expect(zip.file('budget_category_groups.json')).not.toBeNull();
      expect(zip.file('budget_categories.json')).not.toBeNull();
      expect(zip.file('budget_payees.json')).not.toBeNull();
      expect(zip.file('budget_tags.json')).not.toBeNull();
      expect(zip.file('budget_transactions.json')).not.toBeNull();
      expect(zip.file('budget_transaction_tags.json')).not.toBeNull();
      expect(zip.file('cc_generic_payee_names.json')).not.toBeNull();
      expect(zip.file('budget_account_names.json')).not.toBeNull();
      expect(zip.file('partner_contacts.json')).not.toBeNull();
      expect(zip.file('riseup_categories.json')).not.toBeNull();
      expect(zip.file('payee_category_rules.json')).not.toBeNull();
      expect(zip.file('insurance_policies.json')).not.toBeNull();
      expect(zip.file('shopping_categories.json')).not.toBeNull();
      expect(zip.file('shopping_items.json')).not.toBeNull();
      expect(zip.file('shopping_cart_items.json')).not.toBeNull();
      expect(zip.file('shopping_deliveries.json')).not.toBeNull();
      expect(zip.file('moneytor_stock_holdings.json')).not.toBeNull();
      expect(zip.file('moneytor_stock_snapshots.json')).not.toBeNull();
      expect(zip.file('moneytor_accounts.json')).not.toBeNull();
      expect(zip.file('moneytor_account_snapshots.json')).not.toBeNull();
      // Legacy "portfolio old design" tables are intentionally excluded
      expect(zip.file('stock_accounts.json')).toBeNull();
      expect(zip.file('stock_holdings.json')).toBeNull();
      expect(zip.file('stock_account_cash.json')).toBeNull();
      expect(zip.file('stock_account_owners.json')).toBeNull();
      expect(zip.file('stock_price_history.json')).toBeNull();

      // Verify metadata content
      const metadataContent = await zip.file('metadata.json')!.async('string');
      const metadata = JSON.parse(metadataContent);
      expect(metadata.schemaVersion).toBe('1.7');
      expect(metadata.createdBy).toBe('test@example.com');
      expect(metadata.counts).toEqual({
        users: 1,
        profiles: 1,
        households: 1,
        householdMembers: 1,
        pensionAccounts: 1,
        pensionAccountOwners: 1,
        pensionDeposits: 1,
        miscAssets: 1,
        miscAssetOwners: 1,
        mortgageTracks: 0,
        netWorthSnapshots: 1,
        budgetCategoryGroups: 1,
        budgetCategories: 1,
        budgetPayees: 1,
        budgetTags: 1,
        budgetTransactions: 1,
        budgetTransactionTags: 1,
        ccGenericPayeeNames: 0,
        budgetAccountNames: 0,
        partnerContacts: 0,
        riseupCategories: 1,
        payeeCategoryRules: 0,
        insurancePolicies: 0,
        shoppingCategories: 0,
        shoppingItems: 0,
        shoppingCartItems: 0,
        shoppingDeliveries: 0,
        moneytorStockHoldings: 0,
        moneytorStockSnapshots: 0,
        moneytorAccounts: 0,
        moneytorAccountSnapshots: 0,
        moneytorPensionFunds: 0,
        moneytorPensionSnapshots: 0,
      });

      // Verify data files contain correct data
      const usersContent = await zip.file('users.json')!.async('string');
      const users = JSON.parse(usersContent);
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('test@example.com');

      // Moneytor tables are present (empty here but file exists)
      const moneytorAccountsContent = await zip.file('moneytor_accounts.json')!.async('string');
      expect(JSON.parse(moneytorAccountsContent)).toEqual([]);
    });

    it('should handle empty database tables', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentUser.mockResolvedValueOnce(mockUser);

      // Mock all tables as empty
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.profile.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.householdMember.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccountOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionDeposit.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.mortgageTrack.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransactionTag.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.ccGenericPayeeName.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetAccountName.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.partnerContact.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.insurancePolicy.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingDelivery.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorStockSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

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

      // Set up minimal mocks; put Decimal values on a Moneytor holding so we
      // exercise the serializer against a table that's actually in the backup.
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.profile.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.household.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.householdMember.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionAccountOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.pensionDeposit.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAsset.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.miscAssetOwner.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.mortgageTrack.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.netWorthSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategoryGroup.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetTransactionTag.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.ccGenericPayeeName.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.budgetAccountName.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.partnerContact.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.riseupCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.insurancePolicy.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingCategory.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingItem.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingCartItem.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.shoppingDelivery.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorStockHolding.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'msh-1',
          productId: 'prod-1',
          accountName: 'Brokerage',
          broker: null,
          stockName: 'TSLA',
          amount: createDecimal(5.5),
          purchasePrice: createDecimal(200.25),
          purchaseDate: null,
          stockPrice: createDecimal(300),
          currency: 'USD',
          totalWorthInBase: createDecimal(6000),
          accountCash: null,
          householdId: 'household-1',
          syncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      (mockPrisma.moneytorStockSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorAccount.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorAccountSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorPensionFund.findMany as jest.Mock).mockResolvedValueOnce([]);
      (mockPrisma.moneytorPensionSnapshot.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const holdingsContent = await zip.file('moneytor_stock_holdings.json')!.async('string');
      const holdings = JSON.parse(holdingsContent);

      // Verify Decimal values are converted to strings (for precision)
      expect(typeof holdings[0].amount).toBe('string');
      expect(holdings[0].amount).toBe('5.5');
      expect(holdings[0].purchasePrice).toBe('200.25');
    });
  });
});
