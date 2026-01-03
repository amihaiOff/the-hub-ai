import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { prisma } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/portfolio/accounts/[id]
 * Get a single account with its holdings
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    const account = await prisma.stockAccount.findUnique({
      where: { id },
      include: {
        holdings: {
          orderBy: { symbol: 'asc' },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (account.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error) {
    console.error('Error fetching account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch account' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/portfolio/accounts/[id]
 * Update an account
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { name, broker } = body;

    // Validate name if provided
    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return NextResponse.json(
        { success: false, error: 'Account name cannot be empty' },
        { status: 400 }
      );
    }

    // Check if account exists
    const existing = await prisma.stockAccount.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (existing.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Update the account
    const account = await prisma.stockAccount.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(broker !== undefined && { broker: broker?.trim() || null }),
      },
      include: {
        holdings: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update account' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portfolio/accounts/[id]
 * Delete an account and all its holdings
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Check if account exists
    const existing = await prisma.stockAccount.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Authorization check - verify user owns this account
    if (existing.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Delete the account (holdings will cascade delete)
    await prisma.stockAccount.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
