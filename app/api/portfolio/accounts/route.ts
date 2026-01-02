import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/portfolio/accounts
 * Create a new stock account
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, broker } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Account name is required' },
        { status: 400 }
      );
    }

    // Create the account for the authenticated user
    const account = await prisma.stockAccount.create({
      data: {
        name: name.trim(),
        broker: broker?.trim() || null,
        userId: session.user.id,
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
    console.error('Error creating account:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create account' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/portfolio/accounts
 * Get all accounts for the authenticated user (without holdings detail)
 */
export async function GET() {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get accounts only for the authenticated user (authorization enforced by query)
    const accounts = await prisma.stockAccount.findMany({
      where: { userId: session.user.id },
      include: {
        _count: {
          select: { holdings: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
