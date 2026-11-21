/**
 * Unit tests for lib/invites.ts — acceptPendingInvitesForUser.
 * Focus: the invite's role AND allowedSections carry over to the new
 * HouseholdMember, on both the "new profile" and "existing profile" paths.
 */

jest.mock('@/lib/db', () => ({
  prisma: {
    householdInvite: { findMany: jest.fn(), update: jest.fn() },
    profile: { findUnique: jest.fn(), create: jest.fn() },
    householdMember: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { acceptPendingInvitesForUser, inviteExpiryFromNow } from '../invites';

const m = prisma as unknown as {
  householdInvite: { findMany: jest.Mock; update: jest.Mock };
  profile: { findUnique: jest.Mock; create: jest.Mock };
  householdMember: { findUnique: jest.Mock; create: jest.Mock };
};

const invite = {
  id: 'inv-1',
  householdId: 'hh-1',
  email: 'kid@example.com',
  role: 'member',
  allowedSections: ['shopping', 'tasks'],
  suggestedName: 'Kiddo',
  suggestedColor: '#123456',
};

describe('acceptPendingInvitesForUser', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('queries only pending, unexpired invites for the normalised email', async () => {
    m.householdInvite.findMany.mockResolvedValue([]);

    expect(await acceptPendingInvitesForUser('user-1', '  Kid@Example.COM ', null)).toBe(0);

    const { where } = m.householdInvite.findMany.mock.calls[0][0];
    expect(where.email).toBe('kid@example.com');
    expect(where.acceptedAt).toBeNull();
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('copies allowedSections when creating a fresh profile + membership', async () => {
    m.householdInvite.findMany.mockResolvedValue([invite]);
    m.profile.findUnique.mockResolvedValue(null);
    m.profile.create.mockResolvedValue({ id: 'profile-new' });

    expect(await acceptPendingInvitesForUser('user-1', 'kid@example.com', 'Kid')).toBe(1);

    expect(m.profile.create).toHaveBeenCalledWith({
      data: { name: 'Kiddo', color: '#123456', userId: 'user-1' },
    });
    expect(m.householdMember.create).toHaveBeenCalledWith({
      data: {
        householdId: 'hh-1',
        profileId: 'profile-new',
        role: 'member',
        allowedSections: ['shopping', 'tasks'],
      },
    });
    expect(m.householdInvite.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { acceptedAt: expect.any(Date), acceptedByUserId: 'user-1' },
    });
  });

  it('copies allowedSections when an existing profile joins another household', async () => {
    m.householdInvite.findMany.mockResolvedValue([invite]);
    m.profile.findUnique.mockResolvedValue({ id: 'profile-existing' });
    m.householdMember.findUnique.mockResolvedValue(null);

    expect(await acceptPendingInvitesForUser('user-1', 'kid@example.com', 'Kid')).toBe(1);

    expect(m.profile.create).not.toHaveBeenCalled();
    expect(m.householdMember.create).toHaveBeenCalledWith({
      data: {
        householdId: 'hh-1',
        profileId: 'profile-existing',
        role: 'member',
        allowedSections: ['shopping', 'tasks'],
      },
    });
  });

  it('keeps an unrestricted invite unrestricted (empty list)', async () => {
    m.householdInvite.findMany.mockResolvedValue([{ ...invite, allowedSections: [] }]);
    m.profile.findUnique.mockResolvedValue(null);
    m.profile.create.mockResolvedValue({ id: 'profile-new' });

    await acceptPendingInvitesForUser('user-1', 'kid@example.com', null);

    expect(m.householdMember.create.mock.calls[0][0].data.allowedSections).toEqual([]);
  });

  it('only closes the invite when the user is already a member (existing sections untouched)', async () => {
    m.householdInvite.findMany.mockResolvedValue([invite]);
    m.profile.findUnique.mockResolvedValue({ id: 'profile-existing' });
    m.householdMember.findUnique.mockResolvedValue({ id: 'mem-1', allowedSections: [] });

    expect(await acceptPendingInvitesForUser('user-1', 'kid@example.com', null)).toBe(1);

    expect(m.householdMember.create).not.toHaveBeenCalled();
    expect(m.householdInvite.update).toHaveBeenCalledTimes(1);
  });
});

describe('inviteExpiryFromNow', () => {
  it('returns a date the given number of days ahead', () => {
    const before = Date.now();
    const d = inviteExpiryFromNow(7).getTime();
    const dayMs = 86_400_000;
    // DST shifts can move it by up to an hour.
    expect(d - before).toBeGreaterThan(7 * dayMs - 3_700_000);
    expect(d - before).toBeLessThan(7 * dayMs + 3_700_000);
  });
});
