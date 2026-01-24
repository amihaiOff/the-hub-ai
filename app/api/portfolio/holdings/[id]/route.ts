import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';
import { updateHoldingSchema } from '@/lib/validations/portfolio';
import { getFirstZodError } from '@/lib/validations/common';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/portfolio/holdings/[id]
 * Get a single holding
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const holding = await prisma.stockHolding.findUnique({
      where: { id },
      include: {
        account: true,
      },
    });

    if (!holding) {
      return NextResponse.json({ success: false, error: 'Holding not found' }, { status: 404 });
    }

    // Authorization check - verify user owns the account containing this holding
    if (holding.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: holding,
    });
  } catch (error) {
    console.error('Error fetching holding:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch holding' }, { status: 500 });
  }
}

/**
 * PUT /api/portfolio/holdings/[id]
 * Update a holding's quantity and/or cost basis
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
    const validation = updateHoldingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: getFirstZodError(validation.error) },
        { status: 400 }
      );
    }

    const { quantity, avgCostBasis, name, taseSymbol } = validation.data;

    // Check if holding exists and include account for authorization
    const existing = await prisma.stockHolding.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Holding not found' }, { status: 404 });
    }

    // Authorization check - verify user owns the account containing this holding
    if (existing.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Update the holding
    const holding = await prisma.stockHolding.update({
      where: { id },
      data: {
        ...(quantity !== undefined && { quantity }),
        ...(avgCostBasis !== undefined && { avgCostBasis }),
        ...(name !== undefined && { name }),
        ...(taseSymbol !== undefined && { taseSymbol }),
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
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if holding exists and include account for authorization
    const existing = await prisma.stockHolding.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Holding not found' }, { status: 404 });
    }

    // Authorization check - verify user owns the account containing this holding
    if (existing.account.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
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
