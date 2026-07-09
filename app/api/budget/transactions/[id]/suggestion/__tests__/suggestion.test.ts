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
    budgetPayee: {
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
  const payee = (over: Record<string, unknown> = {}) => ({
    id: 'payee-1',
    categoryId: null,
    neverDefault: false,
    isBlacklisted: false,
    ...over,
  });

  it('approve applies the suggested category, clears suggestion fields, and sets the payee default', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
      payee: payee(),
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    (mockPrisma.budgetPayee.update as jest.Mock).mockResolvedValueOnce({});
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 'tx-1', action: 'approve', payeeDefaultUpdated: true });

    const updateCall = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'tx-1' });
    expect(updateCall.data).toEqual({
      categoryId: 'cat-1',
      suggestedCategoryId: null,
      suggestionConfidence: null,
      suggestedAt: null,
    });

    // Payee default set to the approved category.
    const payeeCall = (mockPrisma.budgetPayee.update as jest.Mock).mock.calls[0][0];
    expect(payeeCall).toEqual({ where: { id: 'payee-1' }, data: { categoryId: 'cat-1' } });
  });

  it('approve does NOT overwrite the default for a neverDefault payee', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
      payee: payee({ neverDefault: true }),
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ action: 'approve', payeeDefaultUpdated: false });
    expect(mockPrisma.budgetPayee.update).not.toHaveBeenCalled();
  });

  it('approve does NOT touch a blacklisted payee', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
      payee: payee({ isBlacklisted: true }),
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(json.data).toMatchObject({ payeeDefaultUpdated: false });
    expect(mockPrisma.budgetPayee.update).not.toHaveBeenCalled();
  });

  it('approve skips a no-op when the payee default already matches', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
      payee: payee({ categoryId: 'cat-1' }),
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(json.data).toMatchObject({ payeeDefaultUpdated: false });
    expect(mockPrisma.budgetPayee.update).not.toHaveBeenCalled();
  });

  it('approve still succeeds (200) when setting the payee default fails', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
      payee: payee(),
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    (mockPrisma.budgetPayee.update as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await POST(makeRequest({ action: 'approve' }), params());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ payeeDefaultUpdated: false });
    spy.mockRestore();
  });

  it('dismiss clears the suggestion without changing the category or payee default', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'tx-1',
      suggestedCategoryId: 'cat-1',
      payee: payee(),
    });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce({});
    const res = await POST(makeRequest({ action: 'dismiss' }), params());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({ id: 'tx-1', action: 'dismiss', payeeDefaultUpdated: false });

    const updateCall = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    // categoryId left untouched (undefined) on dismiss.
    expect(updateCall.data.categoryId).toBeUndefined();
    expect(updateCall.data).toMatchObject({
      suggestedCategoryId: null,
      suggestionConfidence: null,
      suggestedAt: null,
    });
    expect(mockPrisma.budgetPayee.update).not.toHaveBeenCalled();
  });
});
