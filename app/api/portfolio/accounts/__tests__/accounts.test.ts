/**
 * Integration tests for /api/portfolio/accounts routes
 * Tests account CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    stockAccount: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import type { CurrentContext } from '@/lib/auth-utils';
import { householdVisibleWhere } from '@/lib/utils/household-scope';

// getCurrentContext fixture. Portfolio routes are household-scoped: they read
// user.id, profile.id and activeHousehold.id from the context.
const HOUSEHOLD_ID = 'household-1';
function asContext(
  user: { id: string; email?: string | null; name?: string | null } | null
): CurrentContext | null {
  if (!user) return null;
  const household = { id: HOUSEHOLD_ID, name: 'Home', description: null, role: 'owner' as const };
  return {
    user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
    profile: {
      id: `profile-${user.id}`,
      name: user.name ?? 'Me',
      image: null,
      color: null,
      userId: user.id,
    },
    households: [household],
    activeHousehold: household,
    householdProfiles: [],
  };
}

// isStockAccountInHousehold (real) runs prisma.stockAccount.findFirst with the
// household-visibility filter. Simulate the DB: only ids in `visible` match,
// and only when the query is actually scoped to the active household.
function mockHouseholdAccounts(visible: string[]) {
  (mockPrisma.stockAccount.findFirst as jest.Mock).mockImplementation(
    async (args: { where: { id: string } }) => {
      const { id, ...rest } = args.where;
      const scoped = JSON.stringify(rest) === JSON.stringify(householdVisibleWhere(HOUSEHOLD_ID));
      return scoped && visible.includes(id) ? { id } : null;
    }
  );
}

import { POST, GET } from '../route';
import { GET as GET_BY_ID, PUT, DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Portfolio Accounts API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockHouseholdAccounts(['acc-1', 'acc-2']);
  });

  describe('POST /api/portfolio/accounts', () => {
    it('should create account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        name: 'Test Account',
        broker: 'Fidelity',
        currency: 'USD',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        holdings: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Account',
          broker: 'Fidelity',
          currency: 'USD',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Dates are serialized to strings in JSON response
      expect(data.data.id).toBe(mockAccount.id);
      expect(data.data.name).toBe(mockAccount.name);
      expect(data.data.broker).toBe(mockAccount.broker);
      expect(data.data.currency).toBe(mockAccount.currency);
      expect(data.data.userId).toBe(mockAccount.userId);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Account',
          broker: 'Fidelity',
          currency: 'USD',
          userId: 'user-1',
          // The creator's profile becomes an owner so the account is
          // household-visible via the go-forward ownership path.
          owners: { create: { profileId: 'profile-user-1' } },
        },
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(asContext(null));

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when name is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ broker: 'Fidelity' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account name is required');
    });

    it('should return 400 when name is empty', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: '   ' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Account name is required');
    });

    it('should default to USD for invalid currency', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test',
        broker: null,
        currency: 'USD',
        userId: 'user-1',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', currency: 'INVALID' }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: 'USD' }),
        })
      );
    });

    it('should accept valid currencies', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test',
        broker: null,
        currency: 'ILS',
        userId: 'user-1',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test', currency: 'ILS' }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: 'ILS' }),
        })
      );
    });

    it('should trim name and broker', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test Account',
        broker: 'Fidelity',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: '  Test Account  ',
          broker: '  Fidelity  ',
        }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Account',
            broker: 'Fidelity',
          }),
        })
      );
    });

    it('should handle null broker', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.create as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Test',
        broker: null,
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      await POST(request);

      expect(mockPrisma.stockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ broker: null }),
        })
      );
    });

    it('should return 400 when broker is whitespace-only', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Account', broker: '   ' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Broker name cannot be empty or whitespace only');
    });

    it('should return 400 when broker is empty string', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Account', broker: '' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Broker name cannot be empty or whitespace only');
    });
  });

  describe('GET /api/portfolio/accounts', () => {
    it('should return user accounts', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccounts = [
        { id: 'acc-1', name: 'Account 1', _count: { holdings: 3 } },
        { id: 'acc-2', name: 'Account 2', _count: { holdings: 5 } },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.findMany as jest.Mock).mockResolvedValueOnce(mockAccounts);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockAccounts);

      expect(mockPrisma.stockAccount.findMany).toHaveBeenCalledWith({
        where: householdVisibleWhere(HOUSEHOLD_ID),
        include: { _count: { select: { holdings: true } } },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(asContext(null));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/portfolio/accounts/[id]', () => {
    it('should return account with holdings', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockAccount = {
        id: 'acc-1',
        name: 'Test',
        userId: 'user-1',
        holdings: [{ id: 'hold-1', symbol: 'AAPL' }],
      };

      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(mockAccount);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockAccount);
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('should return 403 when the account is outside the active household', async () => {
      // Account belongs to a different household → not visible.
      mockHouseholdAccounts([]);
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('PUT /api/portfolio/accounts/[id]', () => {
    it('should update account name and broker', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      const mockExisting = { id: 'acc-1', userId: 'user-1', name: 'Old Name' };
      const mockUpdated = {
        id: 'acc-1',
        name: 'New Name',
        broker: 'New Broker',
        userId: 'user-1',
        holdings: [],
      };

      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.stockAccount.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'New Name', broker: 'New Broker' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockUpdated);

      expect(mockPrisma.stockAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { name: 'New Name', broker: 'New Broker' },
        include: { holdings: true, cashBalances: true },
      });
    });

    it('should update only name when broker not provided', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockAccount.update as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        name: 'Updated',
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });

      expect(mockPrisma.stockAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { name: 'Updated' },
        include: { holdings: true, cashBalances: true },
      });
    });

    it('should set broker to null when provided as null', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockAccount.update as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        broker: null,
        holdings: [],
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ broker: null }),
      });

      await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });

      expect(mockPrisma.stockAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { broker: null },
        include: { holdings: true, cashBalances: true },
      });
    });

    it('should return 400 when name is empty string', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: '' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Account name cannot be empty');
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('should return 403 when the account is outside the active household', async () => {
      // Account belongs to a different household → not visible.
      mockHouseholdAccounts([]);
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('DELETE /api/portfolio/accounts/[id]', () => {
    it('should delete account successfully', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockGetCurrentContext.mockResolvedValueOnce(asContext(mockUser));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'user-1',
      });
      (mockPrisma.stockAccount.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Account deleted successfully');

      expect(mockPrisma.stockAccount.delete).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
      });
    });

    it('should return 404 when account not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('should return 403 when the account is outside the active household', async () => {
      // Account belongs to a different household → not visible.
      mockHouseholdAccounts([]);
      mockGetCurrentContext.mockResolvedValueOnce(
        asContext({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
        })
      );
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-1',
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(asContext(null));

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('household sharing (account created by another household member)', () => {
    // 'partner-user' created acc-partner; 'user-1' is in the same household.
    const me = { id: 'user-1', email: 'me@example.com', name: 'Me' };
    const partnerAccount = { id: 'acc-partner', userId: 'partner-user', name: 'Partner IRA' };

    beforeEach(() => {
      mockHouseholdAccounts(['acc-partner']);
    });

    it('lets a member read it', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(asContext(me));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(partnerAccount);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-partner');
      const response = await GET_BY_ID(request, {
        params: Promise.resolve({ id: 'acc-partner' }),
      });

      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual(partnerAccount);
      expect(mockPrisma.stockAccount.findFirst).toHaveBeenCalledWith({
        where: { id: 'acc-partner', ...householdVisibleWhere(HOUSEHOLD_ID) },
        select: { id: true },
      });
    });

    it('lets a member rename it', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(asContext(me));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(partnerAccount);
      (mockPrisma.stockAccount.update as jest.Mock).mockResolvedValueOnce({
        ...partnerAccount,
        name: 'Renamed',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-partner', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Renamed' }),
      });
      const response = await PUT(request, { params: Promise.resolve({ id: 'acc-partner' }) });

      expect(response.status).toBe(200);
      expect(mockPrisma.stockAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc-partner' }, data: { name: 'Renamed' } })
      );
    });

    it('lets a member delete it', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(asContext(me));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce(partnerAccount);
      (mockPrisma.stockAccount.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-partner', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-partner' }) });

      expect(response.status).toBe(200);
      expect(mockPrisma.stockAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-partner' } });
    });

    it('forbids an account of another household even when the caller created it under a different household', async () => {
      // Same user, but the active household is one where acc-mine is not visible.
      mockHouseholdAccounts([]);
      mockGetCurrentContext.mockResolvedValueOnce(asContext(me));
      (mockPrisma.stockAccount.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'acc-mine',
        userId: 'user-1',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-mine', {
        method: 'DELETE',
      });
      const response = await DELETE(request, { params: Promise.resolve({ id: 'acc-mine' }) });

      expect(response.status).toBe(403);
      expect(mockPrisma.stockAccount.delete).not.toHaveBeenCalled();
    });
  });
});
