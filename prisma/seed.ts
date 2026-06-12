/**
 * Dev seed script — populates the database with realistic mock data for local development.
 *
 * Run with: npx tsx prisma/seed.ts
 * Or via:   npm run db:seed
 *
 * Safe to re-run: uses upsert / skipDuplicates throughout.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const DEV_USER_ID = 'dev-user-local';
const DEV_USER_EMAIL = 'dev@localhost';

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter, log: ['error', 'warn'] });
}

const prisma = createPrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1); // normalise to first of month
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  console.log('Seeding dev database…\n');

  // ── 1. User ─────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: { name: 'Dev User', email: DEV_USER_EMAIL },
    create: { id: DEV_USER_ID, email: DEV_USER_EMAIL, name: 'Dev User' },
  });
  console.log(`✓ User: ${user.email}`);

  // ── 2. Profiles ──────────────────────────────────────────────────────────
  const mainProfile = await prisma.profile.upsert({
    where: { userId: DEV_USER_ID },
    update: {},
    create: {
      name: 'Amihai',
      color: '#3b82f6',
      userId: DEV_USER_ID,
    },
  });
  console.log(`✓ Profile (main): ${mainProfile.name}`);

  // Standalone profile for partner (no login)
  let partnerProfile = await prisma.profile.findFirst({
    where: { name: 'Dana', userId: null },
  });
  if (!partnerProfile) {
    partnerProfile = await prisma.profile.create({
      data: { name: 'Dana', color: '#8b5cf6' },
    });
  }
  console.log(`✓ Profile (partner): ${partnerProfile.name}`);

  // ── 3. Household ─────────────────────────────────────────────────────────
  let household = await prisma.household.findFirst({
    where: { name: "Amihai's Household" },
  });
  if (!household) {
    household = await prisma.household.create({
      data: { name: "Amihai's Household", description: 'Family finances' },
    });
  }
  console.log(`✓ Household: ${household.name}`);

  // Add both profiles as members (idempotent)
  await prisma.householdMember.upsert({
    where: { householdId_profileId: { householdId: household.id, profileId: mainProfile.id } },
    update: {},
    create: { householdId: household.id, profileId: mainProfile.id, role: 'owner' },
  });
  await prisma.householdMember.upsert({
    where: { householdId_profileId: { householdId: household.id, profileId: partnerProfile.id } },
    update: {},
    create: { householdId: household.id, profileId: partnerProfile.id, role: 'member' },
  });
  console.log(`✓ Household members linked`);

  // ── 4. Stock accounts ────────────────────────────────────────────────────
  const ibAccount = await prisma.stockAccount.upsert({
    where: { id: 'seed-stock-ib' },
    update: {},
    create: {
      id: 'seed-stock-ib',
      name: 'Interactive Brokers',
      broker: 'Interactive Brokers',
      currency: 'USD',
      userId: DEV_USER_ID,
    },
  });
  await prisma.stockAccountOwner.upsert({
    where: { accountId_profileId: { accountId: ibAccount.id, profileId: mainProfile.id } },
    update: {},
    create: { accountId: ibAccount.id, profileId: mainProfile.id },
  });

  const taseAccount = await prisma.stockAccount.upsert({
    where: { id: 'seed-stock-tase' },
    update: {},
    create: {
      id: 'seed-stock-tase',
      name: 'מיטב טרייד',
      broker: 'Meitav',
      currency: 'ILS',
      userId: DEV_USER_ID,
    },
  });
  await prisma.stockAccountOwner.upsert({
    where: { accountId_profileId: { accountId: taseAccount.id, profileId: mainProfile.id } },
    update: {},
    create: { accountId: taseAccount.id, profileId: mainProfile.id },
  });

  // Dana has a separate ILS account
  const danaAccount = await prisma.stockAccount.upsert({
    where: { id: 'seed-stock-dana' },
    update: {},
    create: {
      id: 'seed-stock-dana',
      name: "Dana's Portfolio",
      broker: 'Discount',
      currency: 'ILS',
      userId: DEV_USER_ID,
    },
  });
  await prisma.stockAccountOwner.upsert({
    where: { accountId_profileId: { accountId: danaAccount.id, profileId: partnerProfile.id } },
    update: {},
    create: { accountId: danaAccount.id, profileId: partnerProfile.id },
  });

  console.log(`✓ Stock accounts created`);

  // ── 5. Stock holdings ────────────────────────────────────────────────────
  const ibHoldings = [
    { symbol: 'AAPL', quantity: '50', avgCostBasis: '145.00' },
    { symbol: 'GOOGL', quantity: '10', avgCostBasis: '120.00' },
    { symbol: 'MSFT', quantity: '25', avgCostBasis: '300.00' },
    { symbol: 'AMZN', quantity: '15', avgCostBasis: '150.00' },
    { symbol: 'NVDA', quantity: '8', avgCostBasis: '450.00' },
  ];
  for (const h of ibHoldings) {
    await prisma.stockHolding.upsert({
      where: { accountId_symbol: { accountId: ibAccount.id, symbol: h.symbol } },
      update: {},
      create: { accountId: ibAccount.id, ...h },
    });
  }

  const taseHoldings = [
    { symbol: 'TEVA.TA', quantity: '200', avgCostBasis: '35.00' },
    { symbol: 'ICL.TA', quantity: '150', avgCostBasis: '12.50' },
    { symbol: 'NICE.TA', quantity: '30', avgCostBasis: '210.00' },
  ];
  for (const h of taseHoldings) {
    await prisma.stockHolding.upsert({
      where: { accountId_symbol: { accountId: taseAccount.id, symbol: h.symbol } },
      update: {},
      create: { accountId: taseAccount.id, ...h },
    });
  }

  const danaHoldings = [{ symbol: 'BABA', quantity: '40', avgCostBasis: '85.00' }];
  for (const h of danaHoldings) {
    await prisma.stockHolding.upsert({
      where: { accountId_symbol: { accountId: danaAccount.id, symbol: h.symbol } },
      update: {},
      create: { accountId: danaAccount.id, ...h },
    });
  }
  console.log(`✓ Stock holdings created`);

  // ── 6. Stock price history (current prices) ──────────────────────────────
  const prices: Record<string, number> = {
    AAPL: 191.5,
    GOOGL: 172.3,
    MSFT: 422.0,
    AMZN: 198.7,
    NVDA: 875.0,
    'TEVA.TA': 48.6,
    'ICL.TA': 15.8,
    'NICE.TA': 238.0,
    BABA: 76.4,
  };

  const priceTs = new Date();
  for (const [symbol, price] of Object.entries(prices)) {
    await prisma.stockPriceHistory
      .upsert({
        where: { symbol_timestamp: { symbol, timestamp: priceTs } },
        update: { price: price.toString() },
        create: { symbol, price: price.toString(), timestamp: priceTs },
      })
      .catch(() => {
        // Ignore unique constraint if timestamp collides by millisecond
      });
  }
  console.log(`✓ Stock prices seeded`);

  // ── 7. Pension accounts ──────────────────────────────────────────────────
  const pensionAcc = await prisma.pensionAccount.upsert({
    where: { id: 'seed-pension-menora' },
    update: {},
    create: {
      id: 'seed-pension-menora',
      type: 'pension',
      providerName: 'מנורה מבטחים',
      accountName: 'קרן פנסיה',
      currentValue: '285000.00',
      feeFromDeposit: '0.0150',
      feeFromTotal: '0.0050',
      userId: DEV_USER_ID,
    },
  });
  await prisma.pensionAccountOwner.upsert({
    where: { accountId_profileId: { accountId: pensionAcc.id, profileId: mainProfile.id } },
    update: {},
    create: { accountId: pensionAcc.id, profileId: mainProfile.id },
  });

  const hishtalmutAcc = await prisma.pensionAccount.upsert({
    where: { id: 'seed-pension-altshuler' },
    update: {},
    create: {
      id: 'seed-pension-altshuler',
      type: 'hishtalmut',
      providerName: 'אלטשולר שחם',
      accountName: 'השתלמות',
      currentValue: '98000.00',
      feeFromDeposit: '0.0100',
      feeFromTotal: '0.0025',
      userId: DEV_USER_ID,
    },
  });
  await prisma.pensionAccountOwner.upsert({
    where: { accountId_profileId: { accountId: hishtalmutAcc.id, profileId: mainProfile.id } },
    update: {},
    create: { accountId: hishtalmutAcc.id, profileId: mainProfile.id },
  });

  const danaPensionAcc = await prisma.pensionAccount.upsert({
    where: { id: 'seed-pension-dana' },
    update: {},
    create: {
      id: 'seed-pension-dana',
      type: 'pension',
      providerName: 'הפניקס',
      accountName: "Dana's Pension",
      currentValue: '142000.00',
      feeFromDeposit: '0.0120',
      feeFromTotal: '0.0045',
      userId: DEV_USER_ID,
    },
  });
  await prisma.pensionAccountOwner.upsert({
    where: {
      accountId_profileId: { accountId: danaPensionAcc.id, profileId: partnerProfile.id },
    },
    update: {},
    create: { accountId: danaPensionAcc.id, profileId: partnerProfile.id },
  });

  console.log(`✓ Pension accounts created`);

  // ── 8. Pension deposits ──────────────────────────────────────────────────
  // Monthly pension deposits for past 13 months
  for (let i = 13; i >= 1; i--) {
    const salaryMonth = monthsAgo(i);
    const depositDate = monthsAgo(i - 1);
    depositDate.setDate(15);

    const existing = await prisma.pensionDeposit.findFirst({
      where: { accountId: pensionAcc.id, salaryMonth },
    });
    if (!existing) {
      await prisma.pensionDeposit.create({
        data: {
          accountId: pensionAcc.id,
          depositDate,
          salaryMonth,
          amount: (3800 + Math.round((Math.random() - 0.5) * 200)).toString(),
          employer: 'Acme Technologies Ltd.',
        },
      });
    }
  }

  // Hishtalmut: quarterly deposits (employer + employee)
  for (let quarter = 4; quarter >= 1; quarter--) {
    const salaryMonth = monthsAgo(quarter * 3);
    const depositDate = monthsAgo(quarter * 3 - 1);
    depositDate.setDate(20);

    const existing = await prisma.pensionDeposit.findFirst({
      where: { accountId: hishtalmutAcc.id, salaryMonth },
    });
    if (!existing) {
      await prisma.pensionDeposit.create({
        data: {
          accountId: hishtalmutAcc.id,
          depositDate,
          salaryMonth,
          amount: '7600.00',
          employer: 'Acme Technologies Ltd.',
        },
      });
    }
  }

  // Dana pension: monthly for past 13 months
  for (let i = 13; i >= 1; i--) {
    const salaryMonth = monthsAgo(i);
    const depositDate = monthsAgo(i - 1);
    depositDate.setDate(18);

    const existing = await prisma.pensionDeposit.findFirst({
      where: { accountId: danaPensionAcc.id, salaryMonth },
    });
    if (!existing) {
      await prisma.pensionDeposit.create({
        data: {
          accountId: danaPensionAcc.id,
          depositDate,
          salaryMonth,
          amount: (2900 + Math.round((Math.random() - 0.5) * 150)).toString(),
          employer: 'Startup Inc.',
        },
      });
    }
  }
  console.log(`✓ Pension deposits created`);

  // ── 9. Misc assets ───────────────────────────────────────────────────────
  const miscAssets = [
    {
      id: 'seed-misc-savings',
      type: 'bank_deposit' as const,
      name: 'Bank Hapoalim — Savings',
      currentValue: '52000.00',
      interestRate: '0.0400',
      monthlyDeposit: '1000.00',
      maturityDate: new Date('2027-06-01'),
    },
    {
      id: 'seed-misc-emergency',
      type: 'bank_deposit' as const,
      name: 'Discount — Emergency Fund',
      currentValue: '35000.00',
      interestRate: '0.0250',
      monthlyDeposit: null,
      maturityDate: null,
    },
    {
      id: 'seed-misc-mortgage',
      type: 'mortgage' as const,
      name: 'Home Mortgage',
      currentValue: '-1180000.00',
      interestRate: '0.0350',
      monthlyPayment: '4200.00',
      maturityDate: new Date('2048-01-01'),
    },
    {
      id: 'seed-misc-car',
      type: 'loan' as const,
      name: 'Car Loan',
      currentValue: '-58000.00',
      interestRate: '0.0550',
      monthlyPayment: '1600.00',
      maturityDate: new Date('2028-03-01'),
    },
    {
      id: 'seed-misc-child',
      type: 'child_savings' as const,
      name: "Child Savings — Ori",
      currentValue: '28000.00',
      interestRate: '0.0300',
      monthlyDeposit: '500.00',
      maturityDate: new Date('2040-09-01'),
    },
  ];

  for (const asset of miscAssets) {
    const { id, type, name, currentValue, interestRate, ...rest } = asset;
    const created = await prisma.miscAsset.upsert({
      where: { id },
      update: {},
      create: { id, type, name, currentValue, interestRate, userId: DEV_USER_ID, ...rest },
    });
    await prisma.miscAssetOwner.upsert({
      where: { assetId_profileId: { assetId: created.id, profileId: mainProfile.id } },
      update: {},
      create: { assetId: created.id, profileId: mainProfile.id },
    });
  }
  console.log(`✓ Misc assets created`);

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log('\nSeed complete!\n');
  console.log('Summary:');
  console.log('  Profiles  : Amihai (owner) + Dana (member)');
  console.log('  Household : Amihai\'s Household');
  console.log('  Stocks    : IB (5 holdings), מיטב (3 holdings), Dana (1 holding)');
  console.log('  Pension   : מנורה pension + אלטשולר hishtalmut + Dana pension');
  console.log('  Assets    : 2 bank deposits, 1 mortgage, 1 car loan, 1 child savings');
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
