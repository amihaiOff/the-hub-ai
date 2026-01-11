import { PrismaClient, HouseholdRole, PensionAccountType, MiscAssetType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting seed...');

  // Clean existing data (in reverse order of dependencies)
  console.log('🧹 Cleaning existing data...');
  await prisma.stockPriceHistory.deleteMany();
  await prisma.stockHolding.deleteMany();
  await prisma.stockAccountOwner.deleteMany();
  await prisma.stockAccount.deleteMany();
  await prisma.pensionDeposit.deleteMany();
  await prisma.pensionAccountOwner.deleteMany();
  await prisma.pensionAccount.deleteMany();
  await prisma.miscAssetOwner.deleteMany();
  await prisma.miscAsset.deleteMany();
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

  // Create stock accounts
  console.log('📈 Creating stock accounts...');
  const stockAccount1 = await prisma.stockAccount.create({
    data: {
      name: 'Interactive Brokers',
      broker: 'IBKR',
      currency: 'USD',
      userId: realUser.id,
    },
  });

  const stockAccount2 = await prisma.stockAccount.create({
    data: {
      name: 'IBI',
      broker: 'IBI',
      currency: 'ILS',
      userId: realUser.id,
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

  // Create pension accounts
  console.log('🏦 Creating pension accounts...');
  const pensionAccount = await prisma.pensionAccount.create({
    data: {
      type: PensionAccountType.pension,
      providerName: 'Meitav',
      accountName: 'Main Pension',
      currentValue: 450000,
      feeFromDeposit: 0.02,
      feeFromTotal: 0.005,
      userId: realUser.id,
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
      userId: realUser.id,
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

  // Create misc assets
  console.log('🏠 Creating misc assets...');
  const bankDeposit = await prisma.miscAsset.create({
    data: {
      type: MiscAssetType.bank_deposit,
      name: 'Leumi Savings',
      currentValue: 150000,
      interestRate: 0.045,
      maturityDate: new Date(now.getFullYear() + 1, 6, 15),
      userId: realUser.id,
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
      userId: realUser.id,
    },
  });

  const childSavings = await prisma.miscAsset.create({
    data: {
      type: MiscAssetType.child_savings,
      name: 'Kids Education Fund',
      currentValue: 45000,
      interestRate: 0.04,
      monthlyDeposit: 500,
      userId: realUser.id,
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
      userId: realUser.id,
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
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
