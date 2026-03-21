import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createPolicySchema = z.object({
  profileId: z.string().min(1, 'Profile ID is required'),
  mainBranch: z.string().min(1, 'Main branch is required'),
  subBranch: z.string().optional().nullable(),
  productType: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  insurancePeriod: z.string().optional().nullable(),
  additionalDetails: z.string().optional().nullable(),
  premiumIls: z.number().optional().nullable(),
  premiumType: z.string().optional().nullable(),
  policyNumber: z.string().optional().nullable(),
  planClassification: z.string().optional().nullable(),
});

/**
 * GET /api/insurance
 * Returns all insurance policies for the household, grouped by profileId
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;

    const policies = await prisma.insurancePolicy.findMany({
      where: { householdId },
      include: {
        profile: {
          select: { id: true, name: true, color: true, image: true },
        },
      },
      orderBy: [{ profileId: 'asc' }, { mainBranch: 'asc' }, { createdAt: 'asc' }],
    });

    // Group by profileId
    const grouped: Record<
      string,
      {
        profile: { id: string; name: string; color: string | null; image: string | null };
        policies: typeof policies;
      }
    > = {};

    for (const policy of policies) {
      if (!grouped[policy.profileId]) {
        grouped[policy.profileId] = {
          profile: policy.profile,
          policies: [],
        };
      }
      grouped[policy.profileId].policies.push(policy);
    }

    return NextResponse.json({ success: true, data: grouped });
  } catch (error) {
    console.error('Error fetching insurance policies:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch insurance policies' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/insurance
 * Create a single insurance policy
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const householdId = context.activeHousehold.id;
    const body = await request.json();

    const validation = createPolicySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Verify profileId belongs to this household
    const member = await prisma.householdMember.findFirst({
      where: { householdId, profileId: data.profileId },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: 'Profile not found in household' },
        { status: 400 }
      );
    }

    const policy = await prisma.insurancePolicy.create({
      data: {
        profileId: data.profileId,
        householdId,
        mainBranch: data.mainBranch,
        subBranch: data.subBranch ?? null,
        productType: data.productType ?? null,
        company: data.company ?? null,
        insurancePeriod: data.insurancePeriod ?? null,
        additionalDetails: data.additionalDetails ?? null,
        premiumIls: data.premiumIls != null ? data.premiumIls : null,
        premiumType: data.premiumType ?? null,
        policyNumber: data.policyNumber ?? null,
        planClassification: data.planClassification ?? null,
      },
    });

    return NextResponse.json({ success: true, data: policy }, { status: 201 });
  } catch (error) {
    console.error('Error creating insurance policy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create insurance policy' },
      { status: 500 }
    );
  }
}
