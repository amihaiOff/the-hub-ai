import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

const VALID_TYPES = ['bank_deposit', 'loan', 'mortgage', 'child_savings'] as const;
const MAX_NAME_LENGTH = 255;

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
    const { type, name, currentValue, interestRate, monthlyPayment, monthlyDeposit, maturityDate } =
      body;

    // Validate type
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Type must be one of: bank_deposit, loan, mortgage, child_savings',
        },
        { status: 400 }
      );
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    if (name.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Name must be at most ${MAX_NAME_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Validate current value
    if (currentValue === undefined || typeof currentValue !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Current value must be a number' },
        { status: 400 }
      );
    }

    // For liabilities (loan, mortgage), value should be negative
    const isLiability = type === 'loan' || type === 'mortgage';
    const normalizedValue = isLiability && currentValue > 0 ? -currentValue : currentValue;

    // Validate interest rate
    if (
      interestRate === undefined ||
      typeof interestRate !== 'number' ||
      interestRate < 0 ||
      interestRate > 100
    ) {
      return NextResponse.json(
        { success: false, error: 'Interest rate must be a percentage between 0 and 100' },
        { status: 400 }
      );
    }

    // Validate monthly payment (required for loans/mortgages)
    if (isLiability) {
      if (
        monthlyPayment === undefined ||
        typeof monthlyPayment !== 'number' ||
        monthlyPayment <= 0
      ) {
        return NextResponse.json(
          { success: false, error: 'Monthly payment is required for loans and mortgages' },
          { status: 400 }
        );
      }
    }

    // Validate monthly deposit (optional, for child_savings)
    if (monthlyDeposit !== undefined && monthlyDeposit !== null) {
      if (typeof monthlyDeposit !== 'number' || monthlyDeposit < 0) {
        return NextResponse.json(
          { success: false, error: 'Monthly deposit must be a non-negative number' },
          { status: 400 }
        );
      }
    }

    // Validate maturity date (optional)
    let parsedMaturityDate = null;
    if (maturityDate) {
      parsedMaturityDate = new Date(maturityDate);
      if (isNaN(parsedMaturityDate.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid maturity date format' },
          { status: 400 }
        );
      }
    }

    // Create the asset
    const asset = await prisma.miscAsset.create({
      data: {
        type,
        name: name.trim(),
        currentValue: normalizedValue,
        interestRate,
        monthlyPayment: isLiability ? monthlyPayment : null,
        monthlyDeposit: type === 'child_savings' && monthlyDeposit ? monthlyDeposit : null,
        maturityDate: parsedMaturityDate,
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
