import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// For now, we'll use a hardcoded user ID until auth is implemented
const DEMO_USER_ID = 'demo-user';

/**
 * POST /api/portfolio/accounts
 * Create a new stock account
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, broker, userId = DEMO_USER_ID } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Account name is required' },
        { status: 400 }
      );
    }

    // Ensure user exists (create demo user if needed)
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: 'demo@example.com',
        name: 'Demo User',
      },
    });

    // Create the account
    const account = await prisma.stockAccount.create({
      data: {
        name: name.trim(),
        broker: broker?.trim() || null,
        userId,
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
 * Get all accounts for a user (without holdings detail)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || DEMO_USER_ID;

    const accounts = await prisma.stockAccount.findMany({
      where: { userId },
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
