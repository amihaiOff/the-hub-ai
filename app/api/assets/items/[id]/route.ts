import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateAssetSchema } from '@/lib/validations/assets';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/assets/items/[id]
 * Get a single misc asset
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const asset = await prisma.miscAsset.findUnique({
      where: { id },
      include: {
        mortgageTracks: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!asset) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    // Authorization check - verify user owns this asset
    if (asset.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
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
    console.error('Error fetching asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch asset' }, { status: 500 });
  }
}

/**
 * PUT /api/assets/items/[id]
 * Update a misc asset
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updateAssetSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const {
      name,
      currentValue,
      interestRate,
      monthlyPayment,
      monthlyDeposit,
      maturityDate,
      tracks,
    } = validation.data;

    // Check if asset exists
    const existing = await prisma.miscAsset.findUnique({
      where: { id },
      include: { mortgageTracks: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    // Authorization check - verify user owns this asset
    if (existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // For liabilities, ensure value is negative
    const isLiability = existing.type === 'loan' || existing.type === 'mortgage';
    const isMortgage = existing.type === 'mortgage';
    const hasTracks = tracks && tracks.length > 0;

    // Reject tracks for non-mortgage asset types
    if (hasTracks && !isMortgage) {
      return NextResponse.json(
        { success: false, error: 'Tracks can only be added to mortgage assets' },
        { status: 400 }
      );
    }

    // Calculate aggregate values from tracks if provided
    let finalCurrentValue = currentValue;
    let finalInterestRate = interestRate;
    let finalMonthlyPayment = monthlyPayment;

    if (isMortgage && hasTracks) {
      const totalAmount = tracks.reduce((sum, t) => sum + t.amount, 0);
      const totalPayment = tracks.reduce((sum, t) => sum + (t.monthlyPayment || 0), 0);
      const weightedRate =
        totalAmount > 0
          ? tracks.reduce((sum, t) => sum + t.amount * t.interestRate, 0) / totalAmount
          : 0;

      finalCurrentValue = totalAmount;
      finalInterestRate = weightedRate;
      finalMonthlyPayment = totalPayment > 0 ? totalPayment : null;
    }

    let normalizedValue = finalCurrentValue;
    if (finalCurrentValue !== undefined && isLiability && finalCurrentValue > 0) {
      normalizedValue = -finalCurrentValue;
    }

    // Update the asset and tracks in a transaction
    const asset = await prisma.$transaction(async (tx) => {
      // Update the main asset
      const updatedAsset = await tx.miscAsset.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(normalizedValue !== undefined && { currentValue: normalizedValue }),
          ...(finalInterestRate !== undefined && { interestRate: finalInterestRate }),
          ...(finalMonthlyPayment !== undefined && { monthlyPayment: finalMonthlyPayment }),
          ...(monthlyDeposit !== undefined && { monthlyDeposit }),
          ...(maturityDate !== undefined && { maturityDate }),
        },
      });

      // Handle mortgage tracks if provided
      if (isMortgage && tracks !== undefined) {
        // Delete all existing tracks
        await tx.mortgageTrack.deleteMany({
          where: { mortgageId: id },
        });

        // Create new tracks if provided
        if (tracks && tracks.length > 0) {
          await tx.mortgageTrack.createMany({
            data: tracks.map((track, index) => ({
              mortgageId: id,
              name: track.name,
              amount: track.amount,
              interestRate: track.interestRate,
              monthlyPayment: track.monthlyPayment,
              maturityDate: track.maturityDate,
              sortOrder: track.sortOrder ?? index,
            })),
          });
        }
      }

      // Fetch the complete asset with tracks
      return tx.miscAsset.findUnique({
        where: { id },
        include: { mortgageTracks: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Failed to update asset' },
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
    console.error('Error updating asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to update asset' }, { status: 500 });
  }
}

/**
 * DELETE /api/assets/items/[id]
 * Delete a misc asset
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if asset exists
    const existing = await prisma.miscAsset.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    // Authorization check - verify user owns this asset
    if (existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Delete the asset
    await prisma.miscAsset.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete asset' }, { status: 500 });
  }
}
