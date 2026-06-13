/**
 * Integration tests for PATCH /api/moneytor/accounts/[id] route
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    moneytorAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { PATCH } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  profile: { id: 'profile-1', name: 'Test Profile', image: null, color: null, userId: 'user-1' },
  households: [
    { id: 'household-1', name: 'Test Household', description: null, role: 'owner' as const },
  ],
  activeHousehold: {
    id: 'household-1',
    name: 'Test Household',
    description: null,
    role: 'owner' as const,
  },
  householdProfiles: [
    {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      role: 'owner' as const,
      hasUser: true,
    },
  ],
};

function makeRequest(id: string, body: object) {
  return new NextRequest(`http://localhost/api/moneytor/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PATCH /api/moneytor/accounts/[id]', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const response = await PATCH(makeRequest('acct-1', { customSubtitle: 'Test' }), {
      params: Promise.resolve({ id: 'acct-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
  });

  it('should return 404 when account not found', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await PATCH(makeRequest('nonexistent', { customSubtitle: 'Test' }), {
      params: Promise.resolve({ id: 'nonexistent' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Account not found');
  });

  it('should return 404 when account belongs to different household', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findUnique as jest.Mock).mockResolvedValue({
      householdId: 'other-household',
    });

    const response = await PATCH(makeRequest('acct-1', { customSubtitle: 'Test' }), {
      params: Promise.resolve({ id: 'acct-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.ok).toBe(false);
  });

  it('should update customSubtitle successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findUnique as jest.Mock).mockResolvedValue({
      householdId: 'household-1',
    });
    (mockPrisma.moneytorAccount.update as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      customSubtitle: 'My Main Account',
    });

    const response = await PATCH(makeRequest('acct-1', { customSubtitle: 'My Main Account' }), {
      params: Promise.resolve({ id: 'acct-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.account.customSubtitle).toBe('My Main Account');
  });

  it('should clear customSubtitle when set to null', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findUnique as jest.Mock).mockResolvedValue({
      householdId: 'household-1',
    });
    (mockPrisma.moneytorAccount.update as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      customSubtitle: null,
    });

    const response = await PATCH(makeRequest('acct-1', { customSubtitle: null }), {
      params: Promise.resolve({ id: 'acct-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.account.customSubtitle).toBeNull();
  });

  it('should set customSubtitle to null when empty string is provided', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findUnique as jest.Mock).mockResolvedValue({
      householdId: 'household-1',
    });
    (mockPrisma.moneytorAccount.update as jest.Mock).mockResolvedValue({
      id: 'acct-1',
      customSubtitle: null,
    });

    const response = await PATCH(
      makeRequest('acct-1', { customSubtitle: '   ' }), // whitespace only
      { params: Promise.resolve({ id: 'acct-1' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);

    // The update should have been called with null (trimmed empty string = null)
    const updateCall = (mockPrisma.moneytorAccount.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.customSubtitle).toBeNull();
  });

  it('should handle database errors gracefully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.moneytorAccount.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(makeRequest('acct-1', { customSubtitle: 'Test' }), {
      params: Promise.resolve({ id: 'acct-1' }),
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.ok).toBe(false);
  });
});
