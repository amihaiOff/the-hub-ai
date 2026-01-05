import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Validation schema for onboarding data
const onboardingSchema = z.object({
  profileName: z.string().min(1).max(100),
  profileColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  householdName: z.string().min(1).max(100),
  familyMembers: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
    )
    .max(10)
    .optional()
    .default([]),
});

/**
 * POST /api/onboarding
 * Complete the onboarding process for a new user
 * Creates profile, household, and optional family member profiles
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has a profile
    const existingProfile = await prisma.profile.findUnique({
      where: { userId: user.id },
    });

    if (existingProfile) {
      return NextResponse.json(
        { success: false, error: 'User already has a profile' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = onboardingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { profileName, profileColor, householdName, familyMembers } = validation.data;

    // Create everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the user's profile
      const profile = await tx.profile.create({
        data: {
          name: profileName,
          color: profileColor,
          image: user.name ? null : null, // Could populate from Google SSO if available
          userId: user.id,
        },
      });

      // 2. Create the household
      const household = await tx.household.create({
        data: {
          name: householdName,
        },
      });

      // 3. Add user's profile to household as owner
      await tx.householdMember.create({
        data: {
          householdId: household.id,
          profileId: profile.id,
          role: 'owner',
        },
      });

      // 4. Create family member profiles and add them to household
      const familyProfiles = [];
      for (const member of familyMembers) {
        const familyProfile = await tx.profile.create({
          data: {
            name: member.name,
            color: member.color,
            // No userId - these are non-login profiles
          },
        });

        await tx.householdMember.create({
          data: {
            householdId: household.id,
            profileId: familyProfile.id,
            role: 'member',
          },
        });

        familyProfiles.push(familyProfile);
      }

      // 5. Migrate any existing assets from the user to the new profile
      // This handles the case where a user was created before the profile system
      const [stockAccounts, pensionAccounts, miscAssets] = await Promise.all([
        tx.stockAccount.findMany({ where: { userId: user.id } }),
        tx.pensionAccount.findMany({ where: { userId: user.id } }),
        tx.miscAsset.findMany({ where: { userId: user.id } }),
      ]);

      // Create ownership records for existing assets
      if (stockAccounts.length > 0) {
        await tx.stockAccountOwner.createMany({
          data: stockAccounts.map((account) => ({
            accountId: account.id,
            profileId: profile.id,
          })),
        });
      }

      if (pensionAccounts.length > 0) {
        await tx.pensionAccountOwner.createMany({
          data: pensionAccounts.map((account) => ({
            accountId: account.id,
            profileId: profile.id,
          })),
        });
      }

      if (miscAssets.length > 0) {
        await tx.miscAssetOwner.createMany({
          data: miscAssets.map((asset) => ({
            assetId: asset.id,
            profileId: profile.id,
          })),
        });
      }

      return {
        profile,
        household,
        familyProfiles,
        migratedAssets: {
          stockAccounts: stockAccounts.length,
          pensionAccounts: pensionAccounts.length,
          miscAssets: miscAssets.length,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        profileId: result.profile.id,
        householdId: result.household.id,
        familyProfileIds: result.familyProfiles.map((p) => p.id),
        migratedAssets: result.migratedAssets,
      },
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to complete onboarding' },
      { status: 500 }
    );
  }
}
