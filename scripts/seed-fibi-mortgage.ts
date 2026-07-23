/**
 * One-off seeder for the FIBI (הבינלאומי) mortgage described in the June 2026
 * summary. Creates an umbrella MiscAsset of type=mortgage and its three
 * tracks, wired up for automatic simulation. Safe to re-run — uses a stable
 * `name` for the umbrella asset and deletes existing tracks before inserting.
 *
 * Usage:
 *   HOUSEHOLD_ID=<hh_id> DATABASE_URL=<neon-preview-url> \
 *     npx tsx scripts/seed-fibi-mortgage.ts
 *
 * Verify against production is a two-step: run against preview first, confirm
 * simulated balances match the bank app, then rerun against prod.
 */
import { PrismaClient, MortgageRateType } from '@prisma/client';

const prisma = new PrismaClient();

const UMBRELLA_NAME = 'FIBI Mortgage #7233390';
const ORIGINATION = new Date('2026-06-01T00:00:00Z');
const PAYMENT_DAY = 10;
const TERM_MONTHS = 360;

async function main() {
  const householdId = process.env.HOUSEHOLD_ID;
  if (!householdId) throw new Error('Set HOUSEHOLD_ID');
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (dbUrl.includes('ep-sweet-cherry')) {
    // Extra guard: production writes require explicit consent.
    if (process.env.ALLOW_PROD !== 'yes') {
      throw new Error('DATABASE_URL points at prod. Set ALLOW_PROD=yes to proceed.');
    }
  }

  const profile = await prisma.profile.findFirst({
    where: { householdMemberships: { some: { householdId } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!profile) throw new Error(`No profile found in household ${householdId}`);

  const existing = await prisma.miscAsset.findFirst({
    where: { name: UMBRELLA_NAME, owners: { some: { profileId: profile.id } } },
    include: { mortgageTracks: true },
  });

  const umbrella =
    existing ??
    (await prisma.miscAsset.create({
      data: {
        type: 'mortgage',
        name: UMBRELLA_NAME,
        currentValue: 0, // Will be overridden by simulated track sums.
        interestRate: 0.0484,
        userId: profile.userId,
        owners: { create: { profileId: profile.id } },
      },
    }));

  if (existing) {
    await prisma.mortgageTrack.deleteMany({ where: { mortgageId: umbrella.id } });
  }

  await prisma.mortgageTrack.createMany({
    data: [
      {
        mortgageId: umbrella.id,
        name: 'Variable 24m (אג"ח + 0.975)',
        amount: 255000,
        interestRate: 0.0468,
        monthlyPayment: 1319.47,
        originationPrincipal: 255000,
        originationDate: ORIGINATION,
        paymentDay: PAYMENT_DAY,
        termMonths: TERM_MONTHS,
        rateType: MortgageRateType.VARIABLE_24M,
        rateSpread: 0.00975,
        nextResetDate: new Date('2028-06-01T00:00:00Z'),
        sortOrder: 1,
      },
      {
        mortgageId: umbrella.id,
        name: 'Fixed nominal (FREE Spitzer)',
        amount: 467500,
        interestRate: 0.0484,
        monthlyPayment: 2464.13,
        originationPrincipal: 467500,
        originationDate: ORIGINATION,
        paymentDay: PAYMENT_DAY,
        termMonths: TERM_MONTHS,
        rateType: MortgageRateType.FIXED,
        sortOrder: 2,
      },
      {
        mortgageId: umbrella.id,
        name: 'Prime − 1.00',
        amount: 127500,
        interestRate: 0.045,
        monthlyPayment: 627.23,
        originationPrincipal: 127500,
        originationDate: ORIGINATION,
        paymentDay: PAYMENT_DAY,
        termMonths: TERM_MONTHS,
        rateType: MortgageRateType.PRIME_LINKED,
        rateSpread: -0.01,
        sortOrder: 3,
      },
    ],
  });

  // Seed a Prime rate row if none exists — at origination Prime was 5.5%
  // (yielding an effective 4.5% on Track 3 after the −1.00 spread).
  const anyPrime = await prisma.marketRate.findFirst({ where: { name: 'BOI_PRIME' } });
  if (!anyPrime) {
    await prisma.marketRate.create({
      data: { name: 'BOI_PRIME', rate: 0.055, effectiveFrom: ORIGINATION },
    });
  }

  console.log(`✅ Seeded FIBI mortgage under ${UMBRELLA_NAME} for household ${householdId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
