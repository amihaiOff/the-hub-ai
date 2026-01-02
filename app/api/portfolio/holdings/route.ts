import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/portfolio/holdings
 * Add a new stock holding to an account
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, symbol, quantity, avgCostBasis } = body;

    // Validate required fields
    if (!accountId || typeof accountId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Account ID is required' },
        { status: 400 }
      );
    }

    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Stock symbol is required' },
        { status: 400 }
      );
    }

    if (quantity === undefined || typeof quantity !== 'number' || quantity <= 0) {
      return NextResponse.json(
        { success: false, error: 'Quantity must be a positive number' },
        { status: 400 }
      );
    }

    if (avgCostBasis === undefined || typeof avgCostBasis !== 'number' || avgCostBasis < 0) {
      return NextResponse.json(
        { success: false, error: 'Average cost basis must be a non-negative number' },
        { status: 400 }
      );
    }

    // Verify account exists
    const account = await prisma.stockAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Check if holding already exists for this symbol in this account
    const existingHolding = await prisma.stockHolding.findUnique({
      where: {
        accountId_symbol: {
          accountId,
          symbol: symbol.toUpperCase().trim(),
        },
      },
    });

    if (existingHolding) {
      return NextResponse.json(
        {
          success: false,
          error: `A holding for ${symbol.toUpperCase()} already exists in this account. Use PUT to update it.`
        },
        { status: 409 }
      );
    }

    // Create the holding
    const holding = await prisma.stockHolding.create({
      data: {
        accountId,
        symbol: symbol.toUpperCase().trim(),
        quantity,
        avgCostBasis,
      },
    });

    return NextResponse.json({
      success: true,
      data: holding,
    });
  } catch (error) {
    console.error('Error creating holding:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create holding' },
      { status: 500 }
    );
  }
}
