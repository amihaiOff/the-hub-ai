import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Helper to serialize errors including nested causes
function serializeError(err: unknown): string {
  if (err instanceof Error) {
    const parts = [err.message];
    if (err.cause) {
      parts.push(`Cause: ${serializeError(err.cause)}`);
    }
    return parts.join(' | ');
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

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

    // Track progress for better error messages
    let step = 'init';

    // Create records sequentially (avoiding interactive transactions for serverless compatibility)
    // Note: If any step fails after profile creation, we attempt cleanup

    // 1. Create the user's profile
    step = 'create_profile';
    const profile = await prisma.profile.create({
      data: {
        name: profileName,
        color: profileColor,
        image: null,
        userId: user.id,
      },
    });

    let household;
    try {
      // 2. Create the household
      step = 'create_household';
      household = await prisma.household.create({
        data: {
          name: householdName,
        },
      });

      // 3. Add user's profile to household as owner
      step = 'add_owner_to_household';
      await prisma.householdMember.create({
        data: {
          householdId: household.id,
          profileId: profile.id,
          role: 'owner',
        },
      });

      // 4. Create family member profiles and add them to household
      step = 'create_family_members';
      const familyProfiles = [];
      for (const member of familyMembers) {
        const familyProfile = await prisma.profile.create({
          data: {
            name: member.name,
            color: member.color,
            // No userId - these are non-login profiles
          },
        });

        await prisma.householdMember.create({
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
      step = 'find_existing_assets';
      const [stockAccounts, pensionAccounts, miscAssets] = await Promise.all([
        prisma.stockAccount.findMany({ where: { userId: user.id } }),
        prisma.pensionAccount.findMany({ where: { userId: user.id } }),
        prisma.miscAsset.findMany({ where: { userId: user.id } }),
      ]);

      // Create ownership records for existing assets (using individual creates for Neon compatibility)
      step = 'migrate_assets';
      for (const account of stockAccounts) {
        await prisma.stockAccountOwner.create({
          data: {
            accountId: account.id,
            profileId: profile.id,
          },
        });
      }

      for (const account of pensionAccounts) {
        await prisma.pensionAccountOwner.create({
          data: {
            accountId: account.id,
            profileId: profile.id,
          },
        });
      }

      for (const asset of miscAssets) {
        await prisma.miscAssetOwner.create({
          data: {
            assetId: asset.id,
            profileId: profile.id,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          profileId: profile.id,
          householdId: household.id,
          familyProfileIds: familyProfiles.map((p) => p.id),
          migratedAssets: {
            stockAccounts: stockAccounts.length,
            pensionAccounts: pensionAccounts.length,
            miscAssets: miscAssets.length,
          },
        },
      });
    } catch (innerError) {
      // Cleanup: delete the profile we created if subsequent steps failed
      console.error(`Onboarding failed at step "${step}", cleaning up:`, innerError);
      try {
        await prisma.profile.delete({ where: { id: profile.id } });
      } catch (cleanupError) {
        console.error('Failed to cleanup profile:', cleanupError);
      }
      throw new Error(`Onboarding failed at step "${step}": ${serializeError(innerError)}`);
    }
  } catch (error) {
    console.error('Error completing onboarding:', error);
    const errorMessage = serializeError(error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to complete onboarding',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
