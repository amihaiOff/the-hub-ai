import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';

/**
 * Validate an API key from the Authorization header and resolve the household.
 *
 * Usage: `Authorization: Bearer <API_SECRET>`
 *
 * The API_SECRET env var must be set. When valid, returns the first household
 * found in the database (this app is single-household).
 *
 * @returns householdId if authenticated, null otherwise
 */
export async function getHouseholdIdFromApiKey(request: NextRequest): Promise<string | null> {
  const apiSecret = process.env.API_SECRET || process.env.UPLOAD_SCRIPT_API_KEY;
  if (!apiSecret) {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  // Timing-safe comparison to prevent timing attacks
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(apiSecret);
  if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
    return null;
  }

  // Resolve household — find the first one (single-household app)
  const household = await prisma.household.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  return household?.id ?? null;
}
