import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Email allowlist - only these emails can access the app
const ALLOWED_EMAILS =
  process.env.ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) || [];

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ allowed: false }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // If allowlist is empty (not configured), deny all for security
    if (ALLOWED_EMAILS.length === 0) {
      return NextResponse.json({ allowed: false });
    }

    if (ALLOWED_EMAILS.includes(normalizedEmail)) {
      return NextResponse.json({ allowed: true });
    }

    // Pending household invite acts as an implicit allowlist grant so an
    // admin doesn't have to edit the env var every time.
    const invited = await prisma.householdInvite.findFirst({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    return NextResponse.json({ allowed: !!invited });
  } catch {
    return NextResponse.json({ allowed: false }, { status: 500 });
  }
}
