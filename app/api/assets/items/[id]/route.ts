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

    const { name, currentValue, interestRate, monthlyPayment, monthlyDeposit, maturityDate } =
      validation.data;

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

    // For liabilities, ensure value is negative
    const isLiability = existing.type === 'loan' || existing.type === 'mortgage';
    let normalizedValue = currentValue;
    if (currentValue !== undefined && isLiability && currentValue > 0) {
      normalizedValue = -currentValue;
    }

    // Update the asset
    const asset = await prisma.miscAsset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(normalizedValue !== undefined && { currentValue: normalizedValue }),
        ...(interestRate !== undefined && { interestRate }),
        ...(monthlyPayment !== undefined && { monthlyPayment }),
        ...(monthlyDeposit !== undefined && { monthlyDeposit }),
        ...(maturityDate !== undefined && { maturityDate }),
      },
    });

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
