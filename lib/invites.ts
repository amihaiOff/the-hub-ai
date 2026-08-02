import { prisma } from '@/lib/db';

const DEFAULT_INVITE_TTL_DAYS = 30;
const DEFAULT_PROFILE_COLOR = '#8fb4f5';

/** Days from now to a fresh invite's expiry. Exported for tests. */
export function inviteExpiryFromNow(days: number = DEFAULT_INVITE_TTL_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Consume any pending invite for `userId`'s email. When one is found, we
 * create a Profile linked to the User, add a HouseholdMember with the
 * invited role, and stamp the invite as accepted — all in a single
 * transaction. Returns the number of invites accepted (0 or 1 in
 * practice; the loop handles the exotic case where the same email got
 * invited to multiple households in parallel).
 *
 * Idempotent: safe to call on every sign-in / context resolution. Only
 * matches pending (accepted_at IS NULL) and unexpired invites.
 */
export async function acceptPendingInvitesForUser(
  userId: string,
  email: string,
  displayName: string | null
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const now = new Date();
  const pending = await prisma.householdInvite.findMany({
    where: {
      email: normalized,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
  });

  let accepted = 0;
  for (const invite of pending) {
    // Skip if the user is already a member of this household under any
    // profile (e.g. re-invited after acceptance). Just close the invite.
    const existingProfile = await prisma.profile.findUnique({ where: { userId } });
    if (existingProfile) {
      const existingMembership = await prisma.householdMember.findUnique({
        where: {
          householdId_profileId: {
            householdId: invite.householdId,
            profileId: existingProfile.id,
          },
        },
      });
      if (existingMembership) {
        await prisma.householdInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: now, acceptedByUserId: userId },
        });
        accepted++;
        continue;
      }
      // User has a profile but isn't in this household — add them.
      await prisma.householdMember.create({
        data: {
          householdId: invite.householdId,
          profileId: existingProfile.id,
          role: invite.role,
        },
      });
      await prisma.householdInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: now, acceptedByUserId: userId },
      });
      accepted++;
      continue;
    }

    // No profile yet — create one, link it to the user, and join the household.
    const profile = await prisma.profile.create({
      data: {
        name: invite.suggestedName?.trim() || displayName || normalized.split('@')[0],
        color: invite.suggestedColor || DEFAULT_PROFILE_COLOR,
        userId,
      },
    });
    await prisma.householdMember.create({
      data: {
        householdId: invite.householdId,
        profileId: profile.id,
        role: invite.role,
      },
    });
    await prisma.householdInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: now, acceptedByUserId: userId },
    });
    accepted++;
  }

  return accepted;
}
