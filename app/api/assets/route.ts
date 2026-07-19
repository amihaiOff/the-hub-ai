import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';

/**
 * GET /api/assets
 * Get the active household's misc-assets summary — every item visible to
 * any member, per H1 of the codebase review. Also uses integer-cents
 * accumulation on totals.
 */
export async function GET() {
  try {
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const householdId = context.activeHousehold.id;

    const assets = await prisma.miscAsset.findMany({
      where: householdVisibleWhere(householdId),
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
        mortgageTracks: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Cent-accumulate to avoid float drift when summing many Decimals.
    const toCents = (v: unknown) => Math.round(Number(v) * 100);
    const fromCents = (c: number) => c / 100;
    let totalAssetsCents = 0;
    let totalLiabilitiesCents = 0;

    const items = assets.map((asset: (typeof assets)[0]) => {
      const value = Number(asset.currentValue);
      const cents = toCents(asset.currentValue);
      if (cents >= 0) {
        totalAssetsCents += cents;
      } else {
        totalLiabilitiesCents += Math.abs(cents);
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
        mortgageTracks: asset.mortgageTracks.map((track) => ({
          id: track.id,
          name: track.name,
          amount: Number(track.amount),
          interestRate: Number(track.interestRate),
          monthlyPayment: track.monthlyPayment ? Number(track.monthlyPayment) : null,
          maturityDate: track.maturityDate,
          sortOrder: track.sortOrder,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        householdId,
        totalAssets: fromCents(totalAssetsCents),
        totalLiabilities: fromCents(totalLiabilitiesCents),
        netValue: fromCents(totalAssetsCents - totalLiabilitiesCents),
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
