import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_NAME_LENGTH = 255;

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
    const { name, currentValue, interestRate, monthlyPayment, monthlyDeposit, maturityDate } = body;

    // Validate inputs if provided
    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return NextResponse.json({ success: false, error: 'Name cannot be empty' }, { status: 400 });
    }

    if (name !== undefined && name.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Name must be at most ${MAX_NAME_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (currentValue !== undefined && typeof currentValue !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Current value must be a number' },
        { status: 400 }
      );
    }

    if (
      interestRate !== undefined &&
      (typeof interestRate !== 'number' || interestRate < 0 || interestRate > 100)
    ) {
      return NextResponse.json(
        { success: false, error: 'Interest rate must be a percentage between 0 and 100' },
        { status: 400 }
      );
    }

    if (
      monthlyPayment !== undefined &&
      monthlyPayment !== null &&
      (typeof monthlyPayment !== 'number' || monthlyPayment < 0)
    ) {
      return NextResponse.json(
        { success: false, error: 'Monthly payment must be a non-negative number' },
        { status: 400 }
      );
    }

    if (
      monthlyDeposit !== undefined &&
      monthlyDeposit !== null &&
      (typeof monthlyDeposit !== 'number' || monthlyDeposit < 0)
    ) {
      return NextResponse.json(
        { success: false, error: 'Monthly deposit must be a non-negative number' },
        { status: 400 }
      );
    }

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

    // Parse maturity date if provided
    let parsedMaturityDate = undefined;
    if (maturityDate !== undefined) {
      if (maturityDate === null) {
        parsedMaturityDate = null;
      } else {
        const date = new Date(maturityDate);
        if (isNaN(date.getTime())) {
          return NextResponse.json(
            { success: false, error: 'Invalid maturity date format' },
            { status: 400 }
          );
        }
        parsedMaturityDate = date;
      }
    }

    // Update the asset
    const asset = await prisma.miscAsset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(normalizedValue !== undefined && { currentValue: normalizedValue }),
        ...(interestRate !== undefined && { interestRate }),
        ...(monthlyPayment !== undefined && { monthlyPayment }),
        ...(monthlyDeposit !== undefined && { monthlyDeposit }),
        ...(parsedMaturityDate !== undefined && { maturityDate: parsedMaturityDate }),
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
