/**
 * Data Migration Script: Migrate existing users to Profile/Household model
 *
 * This script:
 * 1. Creates a Profile for each existing User (copying name, image)
 * 2. Creates a personal Household for each Profile
 * 3. Adds the Profile to the Household as owner
 * 4. Creates ownership records for all existing assets
 *
 * Run with: npx tsx lib/migrations/migrate-to-profiles.ts
 */

// Load environment variables from .env.local FIRST
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Create a standalone Prisma client for migration
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });
}

const prisma = createPrismaClient();

async function migrateToProfiles() {
  console.log('Starting migration to Profile/Household model...\n');

  // Get all users with their assets
  const users = await prisma.user.findMany({
    include: {
      stockAccounts: true,
      pensionAccounts: true,
      miscAssets: true,
      profile: true, // Check if profile already exists
    },
  });

  console.log(`Found ${users.length} users to migrate\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    // Skip if user already has a profile
    if (user.profile) {
      console.log(`Skipping ${user.email} - already has profile`);
      skippedCount++;
      continue;
    }

    console.log(`Migrating ${user.email}...`);

    try {
      // Use a transaction to ensure all-or-nothing migration
      await prisma.$transaction(async (tx) => {
        // 1. Create Profile
        const profile = await tx.profile.create({
          data: {
            name: user.name || user.email.split('@')[0],
            image: user.image,
            userId: user.id,
          },
        });
        console.log(`  Created profile: ${profile.id}`);

        // 2. Create Household
        const householdName = `${profile.name}'s Household`;
        const household = await tx.household.create({
          data: {
            name: householdName,
          },
        });
        console.log(`  Created household: ${household.name}`);

        // 3. Add Profile to Household as owner
        await tx.householdMember.create({
          data: {
            householdId: household.id,
            profileId: profile.id,
            role: 'owner',
          },
        });
        console.log(`  Added profile to household as owner`);

        // 4. Create ownership records for stock accounts
        for (const account of user.stockAccounts) {
          await tx.stockAccountOwner.create({
            data: {
              accountId: account.id,
              profileId: profile.id,
            },
          });
        }
        if (user.stockAccounts.length > 0) {
          console.log(`  Linked ${user.stockAccounts.length} stock account(s)`);
        }

        // 5. Create ownership records for pension accounts
        for (const account of user.pensionAccounts) {
          await tx.pensionAccountOwner.create({
            data: {
              accountId: account.id,
              profileId: profile.id,
            },
          });
        }
        if (user.pensionAccounts.length > 0) {
          console.log(`  Linked ${user.pensionAccounts.length} pension account(s)`);
        }

        // 6. Create ownership records for misc assets
        for (const asset of user.miscAssets) {
          await tx.miscAssetOwner.create({
            data: {
              assetId: asset.id,
              profileId: profile.id,
            },
          });
        }
        if (user.miscAssets.length > 0) {
          console.log(`  Linked ${user.miscAssets.length} misc asset(s)`);
        }
      });

      migratedCount++;
      console.log(`  ✓ Migration complete for ${user.email}\n`);
    } catch (error) {
      console.error(`  ✗ Error migrating ${user.email}:`, error);
      throw error; // Re-throw to stop migration on error
    }
  }

  console.log('\n--- Migration Summary ---');
  console.log(`Total users: ${users.length}`);
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Skipped (already had profile): ${skippedCount}`);
  console.log('-------------------------\n');
}

// Run migration
migrateToProfiles()
  .then(() => {
    console.log('Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
