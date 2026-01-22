import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { createAssetSchema } from '@/lib/validations/assets';
import { getFirstZodError } from '@/lib/validations/common';

/**
 * POST /api/assets/items
 * Create a new misc asset
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = createAssetSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { type, name, currentValue, interestRate, monthlyPayment, monthlyDeposit, maturityDate } =
      validation.data;

    // For liabilities (loan, mortgage), value should be negative
    const isLiability = type === 'loan' || type === 'mortgage';
    const normalizedValue = isLiability && currentValue > 0 ? -currentValue : currentValue;

    // Create the asset
    const asset = await prisma.miscAsset.create({
      data: {
        type,
        name,
        currentValue: normalizedValue,
        interestRate,
        monthlyPayment: isLiability ? monthlyPayment : null,
        monthlyDeposit: type === 'child_savings' && monthlyDeposit ? monthlyDeposit : null,
        maturityDate,
        userId: user.id,
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
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const assets = await prisma.miscAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
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
      })),
    });
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch assets' }, { status: 500 });
  }
}
