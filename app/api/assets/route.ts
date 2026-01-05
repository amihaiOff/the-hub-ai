import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

/**
 * GET /api/assets
 * Get user's assets summary with all items and totals
 */
export async function GET() {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all misc assets with owners for the user
    const assets = await prisma.miscAsset.findMany({
      where: { userId: user.id },
      include: {
        owners: {
          include: {
            profile: {
              select: {
                id: true,
                name: true,
                image: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate totals
    let totalAssets = 0;
    let totalLiabilities = 0;

    const items = assets.map((asset: (typeof assets)[0]) => {
      const value = Number(asset.currentValue);
      if (value >= 0) {
        totalAssets += value;
      } else {
        totalLiabilities += Math.abs(value);
      }

      return {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        currentValue: value,
        interestRate: Number(asset.interestRate),
        monthlyPayment: asset.monthlyPayment ? Number(asset.monthlyPayment) : null,
        monthlyDeposit: asset.monthlyDeposit ? Number(asset.monthlyDeposit) : null,
        maturityDate: asset.maturityDate,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        owners: asset.owners.map((o) => ({
          id: o.profile.id,
          name: o.profile.name,
          image: o.profile.image,
          color: o.profile.color,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        totalAssets,
        totalLiabilities,
        netValue: totalAssets - totalLiabilities,
        itemsCount: assets.length,
        items,
      },
    });
  } catch (error) {
    console.error('Error fetching assets data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch assets data' },
      { status: 500 }
    );
  }
}
