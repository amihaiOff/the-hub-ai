import { NextRequest, NextResponse } from 'next/server';
import { hasInviteOrMembership } from '@/lib/auth-utils';

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

    // A pending invite or an existing household membership is an implicit
    // allowlist grant (see hasInviteOrMembership).
    return NextResponse.json({ allowed: await hasInviteOrMembership(normalizedEmail) });
  } catch {
    return NextResponse.json({ allowed: false }, { status: 500 });
  }
}
