/**
 * Integration tests for POST /api/budget/transactions/[id]/suggestion
 * (approve / dismiss an AI suggestion).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    budgetTransaction: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { POST } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/budget/transactions/tx-1/suggestion', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const params = (id = 'tx-1') => ({ params: Promise.resolve({ id }) });

beforeEach(() => jest.resetAllMocks());

describe('POST /api/budget/transactions/[id]/suggestion — guards', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ action: 'approve' }), params());
    expect(res.status).toBe(401);
  });

  it('returns 400 on an invalid action', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const res = await POST(makeRequest({ action: 'delete' }), params());
    expect(res.status).toBe(400);
  });

  it('returns 404 when the transaction is not found in the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toMatch(/not found/i);
    // Scoped to the household.
    expect((mockPrisma.budgetTransaction.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
      id: 'tx-1',
      householdId: 'hh-1',
    });
  });

  it('returns 400 when there is no suggestion to act on', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: null,
    });
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No suggestion/i);
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('returns 500 when the update throws', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeRequest({ action: 'approve' }), params());
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('POST /api/budget/transactions/[id]/suggestion — actions', () => {
  it('approve applies the suggested category and clears suggestion fields', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 'tx-1', action: 'approve' });

    const updateCall = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'tx-1' });
    expect(updateCall.data).toEqual({
      categoryId: 'cat-1',
      suggestedCategoryId: null,
      suggestionConfidence: null,
      suggestedAt: null,
    });
  });

  it('dismiss clears the suggestion without changing the category', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    const res = await POST(makeRequest({ action: 'dismiss' }), params());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 'tx-1', action: 'dismiss' });

    const updateCall = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    // categoryId left untouched (undefined) on dismiss.
    expect(updateCall.data.categoryId).toBeUndefined();
    expect(updateCall.data).toMatchObject({
      suggestedCategoryId: null,
      suggestionConfidence: null,
      suggestedAt: null,
    });
  });
});
