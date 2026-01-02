import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/portfolio/holdings/[id]
 * Get a single holding
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const holding = await prisma.stockHolding.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!holding) {
      return NextResponse.json(
        { success: false, error: 'Holding not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: holding,
    });
  } catch (error) {
    console.error('Error fetching holding:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch holding' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/portfolio/holdings/[id]
 * Update a holding's quantity and/or cost basis
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { quantity, avgCostBasis } = body;

    // Validate inputs if provided
    if (quantity !== undefined && (typeof quantity !== 'number' || quantity <= 0)) {
      return NextResponse.json(
        { success: false, error: 'Quantity must be a positive number' },
        { status: 400 }
      );
    }

    if (avgCostBasis !== undefined && (typeof avgCostBasis !== 'number' || avgCostBasis < 0)) {
      return NextResponse.json(
        { success: false, error: 'Average cost basis must be a non-negative number' },
        { status: 400 }
      );
    }

    // Check if holding exists
    const existing = await prisma.stockHolding.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Holding not found' },
        { status: 404 }
      );
    }

    // Update the holding
    const holding = await prisma.stockHolding.update({
      where: { id },
      data: {
        ...(quantity !== undefined && { quantity }),
        ...(avgCostBasis !== undefined && { avgCostBasis }),
      },
    });

    return NextResponse.json({
      success: true,
      data: holding,
    });
  } catch (error) {
    console.error('Error updating holding:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update holding' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portfolio/holdings/[id]
 * Delete a holding
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if holding exists
    const existing = await prisma.stockHolding.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Holding not found' },
        { status: 404 }
      );
    }

    // Delete the holding
    await prisma.stockHolding.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Holding deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting holding:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete holding' },
      { status: 500 }
    );
  }
}
