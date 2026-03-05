/**
 * One-shot script to remove the dev user/profile from a database.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/cleanup-dev-profile.ts
 *
 * What it does:
 *   1. Finds the "dev-user-local" user and its linked profile
 *   2. Shows what will be deleted (dry-run by default)
 *   3. Pass --confirm to actually delete
 *
 * Safe: accounts, assets, and transactions are NOT deleted (only ownership links).
 */

import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}

// Safety: show which database we're connecting to
const hostMatch = connectionString.match(/ep-[^.]*/);
const host = hostMatch ? hostMatch[0] : 'unknown';
console.log(`\nDatabase host: ${host}`);

if (host === 'ep-sweet-cherry-ahrs8a65') {
  console.log('WARNING: This is the PRODUCTION database!\n');
} else if (host === 'ep-restless-rain-ahgyjgi3') {
  console.log('This is the PREVIEW database.\n');
} else {
  console.log('This appears to be a local/unknown database.\n');
}

const dryRun = !process.argv.includes('--confirm');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaPg } = require('@prisma/adapter-pg');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require('pg');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find the dev user
  const devUser = await prisma.user.findUnique({
    where: { id: 'dev-user-local' },
  });

  if (!devUser) {
    console.log('No "dev-user-local" user found. Nothing to clean up.');
    return;
  }

  console.log(`Found dev user: id=${devUser.id}, email=${devUser.email}, name=${devUser.name}`);

  // Find profile linked to this user
  const devProfile = await prisma.profile.findFirst({
    where: { userId: devUser.id },
  });

  if (!devProfile) {
    console.log('No profile linked to dev user.');
  } else {
    console.log(`Found dev profile: id=${devProfile.id}, name=${devProfile.name}`);

    // Check what will be cascade-deleted
    const householdMembers = await prisma.householdMember.count({
      where: { profileId: devProfile.id },
    });
    const stockOwners = await prisma.stockAccountOwner.count({
      where: { profileId: devProfile.id },
    });
    const pensionOwners = await prisma.pensionAccountOwner.count({
      where: { profileId: devProfile.id },
    });
    const assetOwners = await prisma.miscAssetOwner.count({
      where: { profileId: devProfile.id },
    });
    const transactions = await prisma.budgetTransaction.count({
      where: { profileId: devProfile.id },
    });

    console.log('\nCascade impact:');
    console.log(`  Household memberships to remove: ${householdMembers}`);
    console.log(`  Stock account ownership links to remove: ${stockOwners}`);
    console.log(`  Pension account ownership links to remove: ${pensionOwners}`);
    console.log(`  Asset ownership links to remove: ${assetOwners}`);
    console.log(`  Transactions to unattribute (set NULL): ${transactions}`);
    console.log('  (Accounts, assets, and transactions themselves are NOT deleted)');
  }

  if (dryRun) {
    console.log('\n--- DRY RUN --- Pass --confirm to actually delete.');
    return;
  }

  console.log('\nDeleting...');

  // Delete in order: profile first (cascades ownership links), then user
  if (devProfile) {
    await prisma.profile.delete({ where: { id: devProfile.id } });
    console.log(`Deleted profile: ${devProfile.name} (${devProfile.id})`);
  }

  await prisma.user.delete({ where: { id: devUser.id } });
  console.log(`Deleted user: ${devUser.email} (${devUser.id})`);

  console.log('\nDone! Dev user and profile removed.');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
