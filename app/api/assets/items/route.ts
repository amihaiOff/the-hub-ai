import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { householdVisibleWhere } from '@/lib/utils/household-scope';
import { createAssetSchema } from '@/lib/validations/assets';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/assets/items
 * Create a new misc asset
 */
export async function POST(request: NextRequest) {
  try {
    // Household-scoped create. Legacy `userId` still stamped for the
    // creator; owner Profile added so the row is visible to the rest of
    // the household via `householdVisibleWhere`.
    const context = await getCurrentContext();
    if (!context) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const user = context.user;
    const creatorProfileId = context.profile.id;

    const body = await request.json();
    const validation = createAssetSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const {
      type,
      name,
      currentValue,
      interestRate,
      monthlyPayment,
      monthlyDeposit,
      maturityDate,
      tracks,
    } = validation.data;

    // For liabilities (loan, mortgage), value should be negative
    const isLiability = type === 'loan' || type === 'mortgage';
    const isMortgage = type === 'mortgage';
    const hasTracks = tracks && tracks.length > 0;

    // For mortgages with tracks, calculate aggregate values from tracks
    let finalCurrentValue = currentValue;
    let finalInterestRate = interestRate;
    let finalMonthlyPayment = monthlyPayment;

    if (isMortgage && hasTracks) {
      // Calculate totals from tracks
      const totalAmount = tracks.reduce((sum, t) => sum + t.amount, 0);
      const totalPayment = tracks.reduce((sum, t) => sum + (t.monthlyPayment || 0), 0);
      // Weighted average interest rate
      const weightedRate =
        totalAmount > 0
          ? tracks.reduce((sum, t) => sum + t.amount * t.interestRate, 0) / totalAmount
          : 0;

      finalCurrentValue = totalAmount;
      finalInterestRate = weightedRate;
      finalMonthlyPayment = totalPayment > 0 ? totalPayment : null;
    }

    const normalizedValue =
      isLiability && finalCurrentValue > 0 ? -finalCurrentValue : finalCurrentValue;

    // Create the asset with tracks in a transaction
    const asset = await prisma.$transaction(async (tx) => {
      // Create the main asset
      const newAsset = await tx.miscAsset.create({
        data: {
          type,
          name,
          currentValue: normalizedValue,
          interestRate: finalInterestRate,
          monthlyPayment: isLiability ? finalMonthlyPayment : null,
          monthlyDeposit: type === 'child_savings' && monthlyDeposit ? monthlyDeposit : null,
          maturityDate,
          userId: user.id,
          owners: { create: { profileId: creatorProfileId } },
        },
      });

      // Create mortgage tracks if provided
      if (isMortgage && hasTracks) {
        await tx.mortgageTrack.createMany({
          data: tracks.map((track, index) => ({
            mortgageId: newAsset.id,
            name: track.name,
            amount: track.amount,
            interestRate: track.interestRate,
            monthlyPayment: track.monthlyPayment,
            maturityDate: track.maturityDate,
            sortOrder: track.sortOrder ?? index,
          })),
        });
      }

      // Fetch the complete asset with tracks
      return tx.miscAsset.findUnique({
        where: { id: newAsset.id },
        include: { mortgageTracks: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Failed to create asset' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: asset.id,
        type: asset.type,
        name: asset.name,
        currentValue: Number(asset.currentValue),
        interestRate: Number(asset.interestRate),
        monthlyPayment: asset.monthlyPayment ? Number(asset.monthlyPayment) : null,
        monthlyDeposit: asset.monthlyDeposit ? Number(asset.monthlyDeposit) : null,
        maturityDate: asset.maturityDate,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        mortgageTracks: asset.mortgageTracks.map((track) => ({
          id: track.id,
          name: track.name,
          amount: Number(track.amount),
          interestRate: Number(track.interestRate),
          monthlyPayment: track.monthlyPayment ? Number(track.monthlyPayment) : null,
          maturityDate: track.maturityDate,
          sortOrder: track.sortOrder,
        })),
      },
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to create asset' }, { status: 500 });
  }
}

/**
 * GET /api/assets/items
 * Get all misc assets for the authenticated user
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
      orderBy: { createdAt: 'asc' },
      include: {
        mortgageTracks: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return NextResponse.json({
      success: true,
      data: assets.map((asset: (typeof assets)[0]) => ({
        id: asset.id,
        type: asset.type,
        name: asset.name,
        currentValue: Number(asset.currentValue),
        interestRate: Number(asset.interestRate),
        monthlyPayment: asset.monthlyPayment ? Number(asset.monthlyPayment) : null,
        monthlyDeposit: asset.monthlyDeposit ? Number(asset.monthlyDeposit) : null,
        maturityDate: asset.maturityDate,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        mortgageTracks: asset.mortgageTracks.map((track) => ({
          id: track.id,
          name: track.name,
          amount: Number(track.amount),
          interestRate: Number(track.interestRate),
          monthlyPayment: track.monthlyPayment ? Number(track.monthlyPayment) : null,
          maturityDate: track.maturityDate,
          sortOrder: track.sortOrder,
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch assets' }, { status: 500 });
  }
}
