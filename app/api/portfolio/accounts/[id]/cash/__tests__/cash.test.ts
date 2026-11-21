/**
 * Integration tests for /api/portfolio/accounts/[id]/cash endpoints
 * Tests cash balance CRUD operations
 */

// Mock the auth-utils module
const mockGetCurrentContext = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: () => mockGetCurrentContext(),
}));

// Mock Prisma client
const mockPrisma = {
  stockAccount: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  stockAccountCash: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

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

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { PUT, DELETE } from '../[cashId]/route';

describe('Cash Balance API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockHouseholdAccounts(['account-1']);
  });

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockAccount = {
    id: 'account-1',
    userId: 'user-123',
    name: 'Test Account',
    currency: 'USD',
  };

  describe('GET /api/portfolio/accounts/[id]/cash', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(null));

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash');
      const response = await GET(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when account not found', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccount.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/invalid/cash');
      const response = await GET(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Account not found');
    });

    it('returns 403 when the account is outside the active household', async () => {
      // Account belongs to a different household → not visible.
      mockHouseholdAccounts([]);
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccount.findUnique.mockResolvedValue({
        ...mockAccount,
        userId: 'other-user',
      });

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash');
      const response = await GET(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('returns cash balances successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.stockAccountCash.findMany.mockResolvedValue([
        { id: 'cash-1', currency: 'USD', amount: 1000, accountId: 'account-1' },
        { id: 'cash-2', currency: 'EUR', amount: 500, accountId: 'account-1' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'account-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].currency).toBe('USD');
      expect(data.data[0].amount).toBe(1000);
    });
  });

  describe('POST /api/portfolio/accounts/[id]/cash', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(null));

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash', {
        method: 'POST',
        body: JSON.stringify({ currency: 'USD', amount: 1000 }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 for invalid currency', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash', {
        method: 'POST',
        body: JSON.stringify({ currency: 'INVALID', amount: 1000 }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('returns 400 for negative amount', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));

      const request = new NextRequest('http://localhost:3000/api/portfolio/accounts/acc-1/cash', {
        method: 'POST',
        body: JSON.stringify({ currency: 'USD', amount: -100 }),
      });
      const response = await POST(request, { params: Promise.resolve({ id: 'acc-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('creates cash balance successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.stockAccountCash.upsert.mockResolvedValue({
        id: 'cash-1',
        currency: 'USD',
        amount: 1000,
        accountId: 'account-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash',
        {
          method: 'POST',
          body: JSON.stringify({ currency: 'USD', amount: 1000 }),
        }
      );
      const response = await POST(request, { params: Promise.resolve({ id: 'account-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.currency).toBe('USD');
      expect(data.data.amount).toBe(1000);
    });
  });

  describe('PUT /api/portfolio/accounts/[id]/cash/[cashId]', () => {
    const mockCashBalance = {
      id: 'cash-1',
      currency: 'USD',
      amount: 1000,
      accountId: 'account-1',
      account: mockAccount,
    };

    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(null));

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when cash balance not found', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/invalid',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'invalid' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Cash balance not found');
    });

    it('returns 404 when cash belongs to different account', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue({
        ...mockCashBalance,
        accountId: 'other-account',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Cash balance not found in this account');
    });

    it('returns 403 when the account is outside the active household', async () => {
      // Account belongs to a different household → not visible.
      mockHouseholdAccounts([]);
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue({
        ...mockCashBalance,
        account: { ...mockAccount, userId: 'other-user' },
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'account-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('updates cash balance successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(mockCashBalance);
      mockPrisma.stockAccountCash.update.mockResolvedValue({
        id: 'cash-1',
        currency: 'USD',
        amount: 2000,
        accountId: 'account-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash/cash-1',
        {
          method: 'PUT',
          body: JSON.stringify({ amount: 2000 }),
        }
      );
      const response = await PUT(request, {
        params: Promise.resolve({ id: 'account-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.amount).toBe(2000);
    });
  });

  describe('DELETE /api/portfolio/accounts/[id]/cash/[cashId]', () => {
    const mockCashBalance = {
      id: 'cash-1',
      currency: 'USD',
      amount: 1000,
      accountId: 'account-1',
      account: mockAccount,
    };

    it('returns 401 when user is not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(null));

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/cash-1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 404 when cash balance not found', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-1/cash/invalid',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'acc-1', cashId: 'invalid' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Cash balance not found');
    });

    it('deletes cash balance successfully', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue(mockCashBalance);
      mockPrisma.stockAccountCash.delete.mockResolvedValue(mockCashBalance);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/account-1/cash/cash-1',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'account-1', cashId: 'cash-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Cash balance deleted successfully');
    });
  });

  describe('household sharing (account created by another household member)', () => {
    const partnerAccount = { id: 'acc-partner', userId: 'partner-user', currency: 'USD' };

    beforeEach(() => {
      mockHouseholdAccounts(['acc-partner']);
    });

    it('lets a member read its cash balances', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccount.findUnique.mockResolvedValue(partnerAccount);
      mockPrisma.stockAccountCash.findMany.mockResolvedValue([
        { id: 'c1', currency: 'USD', amount: 10, accountId: 'acc-partner' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-partner/cash'
      );
      const response = await GET(request, { params: Promise.resolve({ id: 'acc-partner' }) });

      expect(response.status).toBe(200);
      expect((await response.json()).data).toHaveLength(1);
    });

    it('lets a member delete a cash balance in it', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccountCash.findUnique.mockResolvedValue({
        id: 'c1',
        currency: 'USD',
        amount: 10,
        accountId: 'acc-partner',
        account: partnerAccount,
      });
      mockPrisma.stockAccountCash.delete.mockResolvedValue({});

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-partner/cash/c1',
        { method: 'DELETE' }
      );
      const response = await DELETE(request, {
        params: Promise.resolve({ id: 'acc-partner', cashId: 'c1' }),
      });

      expect(response.status).toBe(200);
      expect(mockPrisma.stockAccountCash.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });

    it('forbids adding cash to a non-household account', async () => {
      mockGetCurrentContext.mockResolvedValue(asContext(mockUser));
      mockPrisma.stockAccount.findUnique.mockResolvedValue({
        id: 'acc-elsewhere',
        userId: 'stranger',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/portfolio/accounts/acc-elsewhere/cash',
        { method: 'POST', body: JSON.stringify({ currency: 'USD', amount: 5 }) }
      );
      const response = await POST(request, { params: Promise.resolve({ id: 'acc-elsewhere' }) });

      expect(response.status).toBe(403);
      expect(mockPrisma.stockAccountCash.upsert).not.toHaveBeenCalled();
    });
  });
});
