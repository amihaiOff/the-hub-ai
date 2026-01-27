import {
  PrismaClient,
  HouseholdRole,
  PensionAccountType,
  MiscAssetType,
  TransactionType,
  TransactionSource,
  PaymentMethod,
} from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log('⏭️  Skipping seed: DATABASE_URL environment variable is not set');
  console.log('   This is normal during CI builds. Run seed manually when needed.');
  process.exit(0);
}

function createPrismaClient(connString: string): PrismaClient {
  const isNeon = connString.includes('neon.tech');

  if (isNeon) {
    // For seeding, use standard pg Pool which works with Neon's Postgres-compatible connection
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require('@prisma/adapter-pg');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require('pg');

    const pool = new Pool({ connectionString: connString });
    const adapter = new PrismaPg(pool);

    return new PrismaClient({ adapter });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require('@prisma/adapter-pg');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg');

  const pool = new Pool({ connectionString: connString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient(connectionString);

async function main() {
  console.log('🌱 Starting seed...');

  // Clean existing data (in reverse order of dependencies)
  console.log('🧹 Cleaning existing data...');
  await prisma.netWorthSnapshot.deleteMany();
  await prisma.stockPriceHistory.deleteMany();
  await prisma.stockHolding.deleteMany();
  await prisma.stockAccountOwner.deleteMany();
  await prisma.stockAccount.deleteMany();
  await prisma.pensionDeposit.deleteMany();
  await prisma.pensionAccountOwner.deleteMany();
  await prisma.pensionAccount.deleteMany();
  await prisma.miscAssetOwner.deleteMany();
  await prisma.miscAsset.deleteMany();
  // Budget module cleanup
  await prisma.budgetTransactionTag.deleteMany();
  await prisma.budgetTransaction.deleteMany();
  await prisma.budgetTag.deleteMany();
  await prisma.budgetPayee.deleteMany();
  await prisma.budgetCategory.deleteMany();
  await prisma.budgetCategoryGroup.deleteMany();
  // Core entities
  await prisma.householdMember.deleteMany();
  await prisma.household.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();

  // Create dev user (matches the SKIP_AUTH dev user in auth-utils.ts)
  console.log('👤 Creating users...');
  const devUser = await prisma.user.upsert({
    where: { id: 'dev-user-local' },
    update: {},
    create: {
      id: 'dev-user-local',
      email: 'dev@localhost',
      name: 'Dev User',
    },
  });

  // Create real user for production/preview OAuth
  const realUser = await prisma.user.create({
    data: {
      email: 'amihaio@gmail.com',
      name: 'Ami Haio',
    },
  });

  // Create profile for dev user (for local development with SKIP_AUTH)
  console.log('👤 Creating profiles...');
  const devProfile = await prisma.profile.create({
    data: {
      name: 'Dev User',
      userId: devUser.id,
      color: '#3b82f6',
    },
  });

  // Create profile for real user (for preview/production)
  const profile = await prisma.profile.create({
    data: {
      name: 'Ami',
      userId: realUser.id,
      color: '#3b82f6',
    },
  });

  // Create spouse profile (no user link - can't login)
  const spouseProfile = await prisma.profile.create({
    data: {
      name: 'Spouse',
      color: '#ec4899',
    },
  });

  // Create household
  console.log('🏠 Creating household...');
  const household = await prisma.household.create({
    data: {
      name: 'Dev Household',
      description: 'Development test household',
    },
  });

  // Add profiles to household
  await prisma.householdMember.createMany({
    data: [
      { householdId: household.id, profileId: devProfile.id, role: HouseholdRole.owner },
      { householdId: household.id, profileId: profile.id, role: HouseholdRole.owner },
      { householdId: household.id, profileId: spouseProfile.id, role: HouseholdRole.member },
    ],
  });

  // Create stock accounts (use devUser for local dev, data is shared via owner tables)
  console.log('📈 Creating stock accounts...');
  const stockAccount1 = await prisma.stockAccount.create({
    data: {
      name: 'Interactive Brokers',
      broker: 'IBKR',
      currency: 'USD',
      userId: devUser.id,
    },
  });

  const stockAccount2 = await prisma.stockAccount.create({
    data: {
      name: 'IBI',
      broker: 'IBI',
      currency: 'ILS',
      userId: devUser.id,
    },
  });

  // Link stock accounts to both dev and real profiles
  await prisma.stockAccountOwner.createMany({
    data: [
      { accountId: stockAccount1.id, profileId: devProfile.id },
      { accountId: stockAccount1.id, profileId: profile.id },
      { accountId: stockAccount2.id, profileId: devProfile.id },
      { accountId: stockAccount2.id, profileId: profile.id },
    ],
  });

  // Create stock holdings
  console.log('💹 Creating stock holdings...');
  await prisma.stockHolding.createMany({
    data: [
      // IBKR account - US stocks
      { accountId: stockAccount1.id, symbol: 'AAPL', quantity: 50, avgCostBasis: 150.25 },
      { accountId: stockAccount1.id, symbol: 'GOOGL', quantity: 20, avgCostBasis: 140.5 },
      { accountId: stockAccount1.id, symbol: 'MSFT', quantity: 30, avgCostBasis: 380.0 },
      { accountId: stockAccount1.id, symbol: 'NVDA', quantity: 15, avgCostBasis: 450.0 },
      { accountId: stockAccount1.id, symbol: 'VOO', quantity: 25, avgCostBasis: 420.0 },
      // IBI account - Israeli stocks
      { accountId: stockAccount2.id, symbol: 'TEVA.TA', quantity: 100, avgCostBasis: 55.0 },
      { accountId: stockAccount2.id, symbol: 'NICE.TA', quantity: 40, avgCostBasis: 850.0 },
    ],
  });

  // Create stock price history (recent prices)
  console.log('💰 Creating stock price history...');
  const now = new Date();
  await prisma.stockPriceHistory.createMany({
    data: [
      { symbol: 'AAPL', price: 178.5, timestamp: now },
      { symbol: 'GOOGL', price: 152.3, timestamp: now },
      { symbol: 'MSFT', price: 415.2, timestamp: now },
      { symbol: 'NVDA', price: 520.0, timestamp: now },
      { symbol: 'VOO', price: 485.0, timestamp: now },
      { symbol: 'TEVA.TA', price: 62.5, timestamp: now },
      { symbol: 'NICE.TA', price: 920.0, timestamp: now },
    ],
  });

  // Create pension accounts (use devUser for local dev)
  console.log('🏦 Creating pension accounts...');
  const pensionAccount = await prisma.pensionAccount.create({
    data: {
      type: PensionAccountType.pension,
      providerName: 'Meitav',
      accountName: 'Main Pension',
      currentValue: 450000,
      feeFromDeposit: 0.02,
      feeFromTotal: 0.005,
      userId: devUser.id,
    },
  });

  const hishtalmutAccount = await prisma.pensionAccount.create({
    data: {
      type: PensionAccountType.hishtalmut,
      providerName: 'Altshuler Shaham',
      accountName: 'Hishtalmut Fund',
      currentValue: 180000,
      feeFromDeposit: 0.015,
      feeFromTotal: 0.004,
      userId: devUser.id,
    },
  });

  const spousePension = await prisma.pensionAccount.create({
    data: {
      type: PensionAccountType.pension,
      providerName: 'Harel',
      accountName: 'Spouse Pension',
      currentValue: 320000,
      feeFromDeposit: 0.018,
      feeFromTotal: 0.0045,
    },
  });

  // Link pension accounts to profiles (dev and real profiles share ownership)
  await prisma.pensionAccountOwner.createMany({
    data: [
      { accountId: pensionAccount.id, profileId: devProfile.id },
      { accountId: pensionAccount.id, profileId: profile.id },
      { accountId: hishtalmutAccount.id, profileId: devProfile.id },
      { accountId: hishtalmutAccount.id, profileId: profile.id },
      { accountId: spousePension.id, profileId: spouseProfile.id },
    ],
  });

  // Create pension deposits (last 6 months)
  console.log('💵 Creating pension deposits...');
  const deposits = [];
  for (let i = 0; i < 6; i++) {
    const depositDate = new Date(now.getFullYear(), now.getMonth() - i, 10);
    const salaryMonth = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);

    // Main pension deposits
    deposits.push({
      accountId: pensionAccount.id,
      depositDate,
      salaryMonth,
      amount: 4500 + Math.random() * 200,
      employer: 'Tech Company Ltd',
    });

    // Hishtalmut deposits
    deposits.push({
      accountId: hishtalmutAccount.id,
      depositDate,
      salaryMonth,
      amount: 2500 + Math.random() * 100,
      employer: 'Tech Company Ltd',
    });

    // Spouse pension deposits
    deposits.push({
      accountId: spousePension.id,
      depositDate,
      salaryMonth,
      amount: 3800 + Math.random() * 150,
      employer: 'Healthcare Inc',
    });
  }
  await prisma.pensionDeposit.createMany({ data: deposits });

  // Create misc assets (use devUser for local dev)
  console.log('🏠 Creating misc assets...');
  const bankDeposit = await prisma.miscAsset.create({
    data: {
      type: MiscAssetType.bank_deposit,
      name: 'Leumi Savings',
      currentValue: 150000,
      interestRate: 0.045,
      maturityDate: new Date(now.getFullYear() + 1, 6, 15),
      userId: devUser.id,
    },
  });

  const mortgage = await prisma.miscAsset.create({
    data: {
      type: MiscAssetType.mortgage,
      name: 'Apartment Mortgage',
      currentValue: -850000,
      interestRate: 0.035,
      monthlyPayment: 4200,
      maturityDate: new Date(now.getFullYear() + 20, 0, 1),
      userId: devUser.id,
    },
  });

  const childSavings = await prisma.miscAsset.create({
    data: {
      type: MiscAssetType.child_savings,
      name: 'Kids Education Fund',
      currentValue: 45000,
      interestRate: 0.04,
      monthlyDeposit: 500,
      userId: devUser.id,
    },
  });

  const carLoan = await prisma.miscAsset.create({
    data: {
      type: MiscAssetType.loan,
      name: 'Car Loan',
      currentValue: -35000,
      interestRate: 0.055,
      monthlyPayment: 1200,
      maturityDate: new Date(now.getFullYear() + 2, 3, 1),
      userId: devUser.id,
    },
  });

  // Link misc assets to profiles (dev and real profiles share ownership)
  await prisma.miscAssetOwner.createMany({
    data: [
      { assetId: bankDeposit.id, profileId: devProfile.id },
      { assetId: bankDeposit.id, profileId: profile.id },
      { assetId: mortgage.id, profileId: devProfile.id },
      { assetId: mortgage.id, profileId: profile.id },
      { assetId: mortgage.id, profileId: spouseProfile.id }, // Joint ownership
      { assetId: childSavings.id, profileId: devProfile.id },
      { assetId: childSavings.id, profileId: profile.id },
      { assetId: carLoan.id, profileId: devProfile.id },
      { assetId: carLoan.id, profileId: profile.id },
    ],
  });

  // Create net worth snapshots (historical data for chart)
  // Based on current values: portfolio ~87k, pension ~630k, assets net ~-690k
  console.log('📈 Creating net worth snapshots...');
  const currentPortfolio = 87400; // Approximate based on seed holdings
  const currentPension = 630000; // devUser's pension accounts
  const currentAssets = -690000; // Net of assets and debts
  const currentNetWorth = currentPortfolio + currentPension + currentAssets;

  // Generate snapshots for both dev and real users
  const userIds = [devUser.id, realUser.id];
  const allSnapshots = [];

  for (const userId of userIds) {
    const seenDates = new Set<string>();

    // Generate 24 bi-weekly snapshots going back 12 months
    for (let i = 23; i >= 0; i--) {
      // Calculate date: go back i * 2 weeks from today
      const snapshotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      snapshotDate.setDate(snapshotDate.getDate() - i * 14);
      // Normalize time to midnight UTC
      snapshotDate.setHours(0, 0, 0, 0);

      const dateKey = snapshotDate.toISOString().split('T')[0];

      // Skip duplicate dates (shouldn't happen, but just in case)
      if (seenDates.has(dateKey)) continue;
      seenDates.add(dateKey);

      // Calculate historical values with realistic growth patterns
      // Portfolio: ~8% annual growth with some volatility
      // Pension: ~6% annual growth
      // Assets: Mortgage slowly decreases, savings slowly increase
      const monthsAgo = i * 0.5;
      const portfolioGrowthFactor = Math.pow(1.08, -monthsAgo / 12);
      const pensionGrowthFactor = Math.pow(1.06, -monthsAgo / 12);
      const assetsChangeRate = monthsAgo * 2000; // Slow improvement (~2k/month)

      // Add some random variation for realism (use deterministic seed based on i)
      const portfolioNoise = 1 + Math.sin(i * 1.5) * 0.05;
      const pensionNoise = 1 + Math.sin(i * 2.3) * 0.02;
      const assetsNoise = Math.sin(i * 3.7) * 2500;

      const portfolio = Math.round(currentPortfolio * portfolioGrowthFactor * portfolioNoise);
      const pension = Math.round(currentPension * pensionGrowthFactor * pensionNoise);
      const assets = Math.round(currentAssets + assetsChangeRate + assetsNoise);
      const netWorth = portfolio + pension + assets;

      allSnapshots.push({
        userId,
        date: snapshotDate,
        netWorth,
        portfolio,
        pension,
        assets,
      });
    }

    // Ensure the most recent snapshot matches current calculated values
    // Find the last snapshot for this user and update it
    const userSnapshots = allSnapshots.filter((s) => s.userId === userId);
    if (userSnapshots.length > 0) {
      const lastSnapshot = userSnapshots[userSnapshots.length - 1];
      lastSnapshot.netWorth = Math.round(currentNetWorth);
      lastSnapshot.portfolio = Math.round(currentPortfolio);
      lastSnapshot.pension = Math.round(currentPension);
      lastSnapshot.assets = Math.round(currentAssets);
    }
  }

  await prisma.netWorthSnapshot.createMany({ data: allSnapshots });

  // Create budget category groups
  console.log('📂 Creating budget category groups...');
  const essentialGroup = await prisma.budgetCategoryGroup.create({
    data: {
      name: 'Essential',
      sortOrder: 1,
      householdId: household.id,
    },
  });

  const lifestyleGroup = await prisma.budgetCategoryGroup.create({
    data: {
      name: 'Lifestyle',
      sortOrder: 2,
      householdId: household.id,
    },
  });

  const savingsGroup = await prisma.budgetCategoryGroup.create({
    data: {
      name: 'Savings & Investments',
      sortOrder: 3,
      householdId: household.id,
    },
  });

  // Create budget categories
  console.log('📋 Creating budget categories...');
  const groceriesCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Groceries',
      groupId: essentialGroup.id,
      budget: 3500,
      isMust: true,
      sortOrder: 1,
      householdId: household.id,
    },
  });

  const utilitiesCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Utilities',
      groupId: essentialGroup.id,
      budget: 800,
      isMust: true,
      sortOrder: 2,
      householdId: household.id,
    },
  });

  const transportCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Transportation',
      groupId: essentialGroup.id,
      budget: 1200,
      isMust: true,
      sortOrder: 3,
      householdId: household.id,
    },
  });

  const healthCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Health & Medical',
      groupId: essentialGroup.id,
      budget: 500,
      isMust: true,
      sortOrder: 4,
      householdId: household.id,
    },
  });

  const diningCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Dining Out',
      groupId: lifestyleGroup.id,
      budget: 1500,
      isMust: false,
      sortOrder: 1,
      householdId: household.id,
    },
  });

  const entertainmentCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Entertainment',
      groupId: lifestyleGroup.id,
      budget: 800,
      isMust: false,
      sortOrder: 2,
      householdId: household.id,
    },
  });

  const shoppingCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Shopping',
      groupId: lifestyleGroup.id,
      budget: 1000,
      isMust: false,
      sortOrder: 3,
      householdId: household.id,
    },
  });

  const subscriptionsCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Subscriptions',
      groupId: lifestyleGroup.id,
      budget: 300,
      isMust: false,
      sortOrder: 4,
      householdId: household.id,
    },
  });

  const emergencyCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Emergency Fund',
      groupId: savingsGroup.id,
      budget: 2000,
      isMust: true,
      sortOrder: 1,
      householdId: household.id,
    },
  });

  const investmentsCategory = await prisma.budgetCategory.create({
    data: {
      name: 'Investments',
      groupId: savingsGroup.id,
      budget: 3000,
      isMust: false,
      sortOrder: 2,
      householdId: household.id,
    },
  });

  // Create budget payees
  console.log('🏪 Creating budget payees...');
  const supersolPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Shufersal',
      categoryId: groceriesCategory.id,
      householdId: household.id,
    },
  });

  const ramiLevyPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Rami Levy',
      categoryId: groceriesCategory.id,
      householdId: household.id,
    },
  });

  const electricPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Israel Electric',
      categoryId: utilitiesCategory.id,
      householdId: household.id,
    },
  });

  const waterPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Mei Gvaram',
      categoryId: utilitiesCategory.id,
      householdId: household.id,
    },
  });

  const gasPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Paz Gas Station',
      categoryId: transportCategory.id,
      householdId: household.id,
    },
  });

  const cafePayee = await prisma.budgetPayee.create({
    data: {
      name: 'Aroma Espresso Bar',
      categoryId: diningCategory.id,
      householdId: household.id,
    },
  });

  const restaurantPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Ouzeria Restaurant',
      categoryId: diningCategory.id,
      householdId: household.id,
    },
  });

  const netflixPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Netflix',
      categoryId: subscriptionsCategory.id,
      householdId: household.id,
    },
  });

  const spotifyPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Spotify',
      categoryId: subscriptionsCategory.id,
      householdId: household.id,
    },
  });

  const pharmacyPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Super-Pharm',
      categoryId: healthCategory.id,
      householdId: household.id,
    },
  });

  const employerPayee = await prisma.budgetPayee.create({
    data: {
      name: 'Tech Company Ltd',
      householdId: household.id,
    },
  });

  // Create budget tags
  console.log('🏷️ Creating budget tags...');
  const recurringTag = await prisma.budgetTag.create({
    data: {
      name: 'Recurring',
      color: '#6366f1',
      householdId: household.id,
    },
  });

  const needsReviewTag = await prisma.budgetTag.create({
    data: {
      name: 'Needs Review',
      color: '#f59e0b',
      householdId: household.id,
    },
  });

  const workExpenseTag = await prisma.budgetTag.create({
    data: {
      name: 'Work Expense',
      color: '#10b981',
      householdId: household.id,
    },
  });

  // Create budget transactions (last 3 months)
  console.log('💳 Creating budget transactions...');
  const transactionsToCreate = [];

  // Helper to create random date within a month
  const randomDateInMonth = (year: number, month: number) => {
    const day = Math.floor(Math.random() * 28) + 1;
    return new Date(year, month, day);
  };

  // Generate transactions for the last 3 months
  for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
    const year = now.getFullYear();
    const month = now.getMonth() - monthOffset;

    // Salary income (beginning of month)
    transactionsToCreate.push({
      type: TransactionType.income,
      transactionDate: new Date(year, month, 1),
      amountIls: 25000,
      currency: 'ILS',
      amountOriginal: 25000,
      categoryId: null,
      payeeId: employerPayee.id,
      paymentMethod: PaymentMethod.bank_transfer,
      notes: 'Monthly salary',
      source: TransactionSource.manual,
      isRecurring: true,
      householdId: household.id,
    });

    // Groceries (weekly)
    for (let week = 0; week < 4; week++) {
      transactionsToCreate.push({
        type: TransactionType.expense,
        transactionDate: randomDateInMonth(year, month),
        amountIls: 600 + Math.floor(Math.random() * 300),
        currency: 'ILS',
        amountOriginal: 600 + Math.floor(Math.random() * 300),
        categoryId: groceriesCategory.id,
        payeeId: week % 2 === 0 ? supersolPayee.id : ramiLevyPayee.id,
        paymentMethod: PaymentMethod.credit_card,
        notes: null,
        source: TransactionSource.manual,
        isRecurring: false,
        householdId: household.id,
      });
    }

    // Utilities (monthly)
    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: new Date(year, month, 15),
      amountIls: 350 + Math.floor(Math.random() * 100),
      currency: 'ILS',
      amountOriginal: 350 + Math.floor(Math.random() * 100),
      categoryId: utilitiesCategory.id,
      payeeId: electricPayee.id,
      paymentMethod: PaymentMethod.bank_transfer,
      notes: 'Electric bill',
      source: TransactionSource.manual,
      isRecurring: true,
      householdId: household.id,
    });

    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: new Date(year, month, 18),
      amountIls: 180 + Math.floor(Math.random() * 50),
      currency: 'ILS',
      amountOriginal: 180 + Math.floor(Math.random() * 50),
      categoryId: utilitiesCategory.id,
      payeeId: waterPayee.id,
      paymentMethod: PaymentMethod.bank_transfer,
      notes: 'Water bill',
      source: TransactionSource.manual,
      isRecurring: true,
      householdId: household.id,
    });

    // Gas (bi-weekly)
    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: randomDateInMonth(year, month),
      amountIls: 300 + Math.floor(Math.random() * 100),
      currency: 'ILS',
      amountOriginal: 300 + Math.floor(Math.random() * 100),
      categoryId: transportCategory.id,
      payeeId: gasPayee.id,
      paymentMethod: PaymentMethod.credit_card,
      notes: null,
      source: TransactionSource.manual,
      isRecurring: false,
      householdId: household.id,
    });

    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: randomDateInMonth(year, month),
      amountIls: 280 + Math.floor(Math.random() * 100),
      currency: 'ILS',
      amountOriginal: 280 + Math.floor(Math.random() * 100),
      categoryId: transportCategory.id,
      payeeId: gasPayee.id,
      paymentMethod: PaymentMethod.credit_card,
      notes: null,
      source: TransactionSource.manual,
      isRecurring: false,
      householdId: household.id,
    });

    // Dining out (several times a month)
    for (let i = 0; i < 3; i++) {
      transactionsToCreate.push({
        type: TransactionType.expense,
        transactionDate: randomDateInMonth(year, month),
        amountIls: 80 + Math.floor(Math.random() * 60),
        currency: 'ILS',
        amountOriginal: 80 + Math.floor(Math.random() * 60),
        categoryId: diningCategory.id,
        payeeId: cafePayee.id,
        paymentMethod: PaymentMethod.credit_card,
        notes: null,
        source: TransactionSource.manual,
        isRecurring: false,
        householdId: household.id,
      });
    }

    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: randomDateInMonth(year, month),
      amountIls: 350 + Math.floor(Math.random() * 150),
      currency: 'ILS',
      amountOriginal: 350 + Math.floor(Math.random() * 150),
      categoryId: diningCategory.id,
      payeeId: restaurantPayee.id,
      paymentMethod: PaymentMethod.credit_card,
      notes: 'Family dinner',
      source: TransactionSource.manual,
      isRecurring: false,
      householdId: household.id,
    });

    // Subscriptions (monthly)
    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: new Date(year, month, 5),
      amountIls: 55,
      currency: 'ILS',
      amountOriginal: 55,
      categoryId: subscriptionsCategory.id,
      payeeId: netflixPayee.id,
      paymentMethod: PaymentMethod.credit_card,
      notes: 'Monthly subscription',
      source: TransactionSource.manual,
      isRecurring: true,
      householdId: household.id,
    });

    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: new Date(year, month, 8),
      amountIls: 25,
      currency: 'ILS',
      amountOriginal: 25,
      categoryId: subscriptionsCategory.id,
      payeeId: spotifyPayee.id,
      paymentMethod: PaymentMethod.credit_card,
      notes: 'Monthly subscription',
      source: TransactionSource.manual,
      isRecurring: true,
      householdId: household.id,
    });

    // Health (occasional)
    if (monthOffset === 0 || monthOffset === 2) {
      transactionsToCreate.push({
        type: TransactionType.expense,
        transactionDate: randomDateInMonth(year, month),
        amountIls: 150 + Math.floor(Math.random() * 100),
        currency: 'ILS',
        amountOriginal: 150 + Math.floor(Math.random() * 100),
        categoryId: healthCategory.id,
        payeeId: pharmacyPayee.id,
        paymentMethod: PaymentMethod.credit_card,
        notes: null,
        source: TransactionSource.manual,
        isRecurring: false,
        householdId: household.id,
      });
    }

    // Uncategorized expenses (to show uncategorized section)
    transactionsToCreate.push({
      type: TransactionType.expense,
      transactionDate: randomDateInMonth(year, month),
      amountIls: 200 + Math.floor(Math.random() * 100),
      currency: 'ILS',
      amountOriginal: 200 + Math.floor(Math.random() * 100),
      categoryId: null,
      payeeId: null,
      paymentMethod: PaymentMethod.credit_card,
      notes: 'Unknown charge',
      source: TransactionSource.bank_import,
      isRecurring: false,
      householdId: household.id,
    });
  }

  // Create transactions one by one (Neon compatibility)
  const transactionIds: string[] = [];
  for (const txData of transactionsToCreate) {
    const tx = await prisma.budgetTransaction.create({ data: txData });
    transactionIds.push(tx.id);
  }

  // Add tags to some transactions
  const recurringTransactions = transactionsToCreate
    .map((t, i) => ({ ...t, id: transactionIds[i] }))
    .filter((t) => t.isRecurring);
  for (const tx of recurringTransactions.slice(0, 10)) {
    await prisma.budgetTransactionTag.create({
      data: {
        transactionId: tx.id,
        tagId: recurringTag.id,
      },
    });
  }

  // Add "Needs Review" tag to uncategorized transactions
  const uncategorizedTransactions = transactionsToCreate
    .map((t, i) => ({ ...t, id: transactionIds[i] }))
    .filter((t) => !t.categoryId && t.type === TransactionType.expense);
  for (const tx of uncategorizedTransactions) {
    await prisma.budgetTransactionTag.create({
      data: {
        transactionId: tx.id,
        tagId: needsReviewTag.id,
      },
    });
  }

  console.log('✅ Seed completed!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Users: 2`);
  console.log(`     - dev@localhost (for local SKIP_AUTH)`);
  console.log(`     - amihaio@gmail.com (for preview/production OAuth)`);
  console.log(`   Profiles: 3 (Dev User, Ami, Spouse)`);
  console.log(`   Households: 1`);
  console.log(`   Stock Accounts: 2 with 7 holdings`);
  console.log(`   Pension Accounts: 3 with ${deposits.length} deposits`);
  console.log(`   Misc Assets: 4 (deposit, mortgage, child savings, car loan)`);
  console.log(`   Net Worth Snapshots: ${allSnapshots.length} (24 per user, 12 months of history)`);
  console.log(`   Budget Category Groups: 3 (Essential, Lifestyle, Savings)`);
  console.log(`   Budget Categories: 10`);
  console.log(`   Budget Payees: 11`);
  console.log(`   Budget Tags: 3`);
  console.log(`   Budget Transactions: ${transactionIds.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
