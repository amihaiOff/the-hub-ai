/**
 * Integration tests for /api/households/[id]/invites (GET + POST).
 * Focus: allowedSections (section-restricted invitees) is validated,
 * persisted on create AND refresh, and echoed back.
 */

import { NextRequest } from 'next/server';

const mockGetCurrentContext = jest.fn();
const mockIsHouseholdAdmin = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: (...args: unknown[]) => mockGetCurrentContext(...args),
  isHouseholdAdmin: (...args: unknown[]) => mockIsHouseholdAdmin(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    profile: { findFirst: jest.fn() },
    householdInvite: { findMany: jest.fn(), upsert: jest.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { GET, POST } from '../[id]/invites/route';

const HH = 'cm1234567890household1';
const params = { params: Promise.resolve({ id: HH }) };

const adminContext = {
  user: { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
  profile: { id: 'cm1234567890adminprofi', name: 'Admin', image: null, color: null },
  households: [{ id: HH, name: 'Home', description: null, role: 'owner' }],
  activeHousehold: { id: HH, name: 'Home', description: null, role: 'owner' },
  householdProfiles: [],
};

function post(body: unknown) {
  return POST(
    new NextRequest(`http://localhost:3000/api/households/${HH}/invites`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    params
  );
}

describe('Household Invites API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetCurrentContext.mockResolvedValue(adminContext);
    mockIsHouseholdAdmin.mockReturnValue(true);
    (prisma.profile.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.householdInvite.upsert as jest.Mock).mockImplementation(
      async (args: { create: Record<string, unknown> }) => ({
        id: 'inv-1',
        createdAt: new Date('2026-11-21T00:00:00Z'),
        ...args.create,
      })
    );
  });

  describe('POST', () => {
    it('persists allowedSections on both create and refresh branches of the upsert', async () => {
      const response = await post({
        email: 'Kid@Example.com',
        allowedSections: ['shopping', 'tasks'],
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.allowedSections).toEqual(['shopping', 'tasks']);

      const args = (prisma.householdInvite.upsert as jest.Mock).mock.calls[0][0];
      expect(args.where).toEqual({
        householdId_email: { householdId: HH, email: 'kid@example.com' },
      });
      expect(args.create).toEqual(
        expect.objectContaining({
          householdId: HH,
          email: 'kid@example.com',
          role: 'member',
          allowedSections: ['shopping', 'tasks'],
        })
      );
      // A re-invite must overwrite the old restriction, not keep it.
      expect(args.update.allowedSections).toEqual(['shopping', 'tasks']);
      expect(args.update.acceptedAt).toBeNull();
    });

    it('defaults allowedSections to [] (unrestricted) when omitted', async () => {
      const response = await post({ email: 'partner@example.com' });

      expect(response.status).toBe(200);
      const args = (prisma.householdInvite.upsert as jest.Mock).mock.calls[0][0];
      expect(args.create.allowedSections).toEqual([]);
      expect(args.update.allowedSections).toEqual([]);
    });

    it('rejects an unknown section id', async () => {
      const response = await post({ email: 'kid@example.com', allowedSections: ['settings'] });

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Invalid data');
      expect(prisma.householdInvite.upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-array allowedSections', async () => {
      const response = await post({ email: 'kid@example.com', allowedSections: 'finances' });

      expect(response.status).toBe(400);
      expect(prisma.householdInvite.upsert).not.toHaveBeenCalled();
    });

    it('forbids non-admins', async () => {
      mockIsHouseholdAdmin.mockReturnValue(false);

      const response = await post({ email: 'kid@example.com', allowedSections: ['shopping'] });

      expect(response.status).toBe(403);
      expect(prisma.householdInvite.upsert).not.toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(null);

      const response = await post({ email: 'kid@example.com' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET', () => {
    it('includes allowedSections for each pending invite', async () => {
      (prisma.householdInvite.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'inv-1',
          email: 'kid@example.com',
          role: 'member',
          allowedSections: ['shopping'],
          suggestedName: null,
          suggestedColor: null,
          createdAt: new Date(),
          expiresAt: new Date(),
        },
      ]);

      const response = await GET(
        new NextRequest(`http://localhost:3000/api/households/${HH}/invites`),
        params
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0].allowedSections).toEqual(['shopping']);
    });
  });
});
