/**
 * Integration tests for /api/budget/transactions/[id] (GET / PUT / DELETE).
 *
 * Focus: auth guards, ownership/not-found (findFirst scoped by id + householdId),
 * zod validation, related-entity ownership checks, the field-update mapping, and
 * — importantly — the branch that clears the AI suggestion fields when a category
 * is manually assigned.
 */

import { NextRequest } from 'next/server';

// Mocks must be declared before importing the route.
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetTransaction: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    budgetCategory: {
      findFirst: jest.fn(),
    },
    budgetPayee: {
      findFirst: jest.fn(),
    },
    householdMember: {
      findFirst: jest.fn(),
    },
    budgetTag: {
      findMany: jest.fn(),
    },
    budgetTransactionTag: {
      findMany: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, PUT, DELETE } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
} as unknown as NonNullable<Awaited<ReturnType<typeof getCurrentContext>>>;

const params = (id = 'tx-1') => ({ params: Promise.resolve({ id }) });

/** Build a DB-shaped transaction that satisfies transformTransaction(). */
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    type: 'expense',
    transactionDate: new Date('2026-01-15T00:00:00Z'),
    paymentDate: new Date('2026-01-20T00:00:00Z'),
    amountIls: 100,
    currency: 'ILS',
    amountOriginal: 100,
    categoryId: null,
    suggestedCategoryId: null,
    suggestionConfidence: null,
    payeeId: null,
    paymentMethod: 'credit_card',
    paymentNumber: null,
    totalPayments: null,
    notes: null,
    source: 'manual',
    isRecurring: false,
    isSplit: false,
    originalTransactionId: null,
    paymentIdentifier: null,
    excludedFromFlow: false,
    profileId: null,
    householdId: 'hh-1',
    createdAt: new Date('2026-01-15T00:00:00Z'),
    updatedAt: new Date('2026-01-15T00:00:00Z'),
    isDeleted: false,
    tags: [],
    category: null,
    suggestedCategory: null,
    payee: null,
    profile: null,
    splitChildren: [],
    ...overrides,
  };
}

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/budget/transactions/tx-1', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------
describe('GET /api/budget/transactions/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await GET(req('GET'), params());
    expect(res.status).toBe(401);
    expect(mockPrisma.budgetTransaction.findFirst).not.toHaveBeenCalled();
  });

  it('returns 404 when the transaction is missing / in another household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await GET(req('GET'), params('missing'));
    expect(res.status).toBe(404);
    // Scoped by id + active household + not soft-deleted.
    expect(mockPrisma.budgetTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'missing', householdId: 'hh-1', isDeleted: false }),
      })
    );
  });

  it('returns the transaction with its (transformed) split children', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    const child = makeTx({ id: 'child-1', originalTransactionId: 'tx-1' });
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(
      makeTx({ splitChildren: [child] })
    );
    const res = await GET(req('GET'), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('tx-1');
    expect(json.data.transactionDate).toBe('2026-01-15');
    expect(json.data.splitChildren).toHaveLength(1);
    expect(json.data.splitChildren[0].id).toBe('child-1');
  });
});

// -----------------------------------------------------------------------------
// PUT
// -----------------------------------------------------------------------------
describe('PUT /api/budget/transactions/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await PUT(req('PUT', { notes: 'x' }), params());
    expect(res.status).toBe(401);
  });

  it('returns 404 when the transaction does not belong to the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await PUT(req('PUT', { notes: 'x' }), params());
    expect(res.status).toBe(404);
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid body (negative amount fails zod)', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    const res = await PUT(req('PUT', { amountIls: -5 }), params());
    expect(res.status).toBe(400);
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid enum value', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    const res = await PUT(req('PUT', { type: 'transfer' }), params());
    expect(res.status).toBe(400);
  });

  it('returns 404 when the supplied category is not in the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await PUT(req('PUT', { categoryId: 'cat-x' }), params());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Category not found');
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the supplied payee is not in the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetPayee.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await PUT(req('PUT', { payeeId: 'payee-x' }), params());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Payee not found');
  });

  it('returns 404 when the supplied profile is not a household member', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.householdMember.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await PUT(req('PUT', { profileId: 'profile-x' }), params());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Profile not found');
  });

  it('returns 404 when one or more tags are not in the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    // Only 1 of the 2 requested tags exists.
    (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'tag-1' }]);
    const res = await PUT(req('PUT', { tagIds: ['tag-1', 'tag-2'] }), params());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('One or more tags not found');
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('assigning a categoryId clears the pending AI suggestion fields', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'cat-1' });
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetTransaction.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTx({ categoryId: 'cat-1', category: { id: 'cat-1', name: 'Food' } })
    );

    const res = await PUT(req('PUT', { categoryId: 'cat-1' }), params());
    expect(res.status).toBe(200);

    const updateArg = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'tx-1' });
    expect(updateArg.data.categoryId).toBe('cat-1');
    expect(updateArg.data.suggestedCategoryId).toBeNull();
    expect(updateArg.data.suggestionConfidence).toBeNull();
    expect(updateArg.data.suggestedAt).toBeNull();
  });

  it('clearing a category (categoryId=null) does NOT clear the suggestion fields', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetTransaction.findUnique as jest.Mock).mockResolvedValueOnce(makeTx());

    const res = await PUT(req('PUT', { categoryId: null }), params());
    expect(res.status).toBe(200);
    // No category lookup should run for a null assignment.
    expect(mockPrisma.budgetCategory.findFirst).not.toHaveBeenCalled();

    const updateArg = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.categoryId).toBeNull();
    expect('suggestedCategoryId' in updateArg.data).toBe(false);
  });

  it('maps scalar field updates and refreshes tag links', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'tag-1' }]);
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetTransactionTag.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'link-1' },
    ]);
    (mockPrisma.budgetTransactionTag.delete as jest.Mock).mockResolvedValueOnce({});
    (mockPrisma.budgetTransactionTag.create as jest.Mock).mockResolvedValueOnce({});
    (mockPrisma.budgetTransaction.findUnique as jest.Mock).mockResolvedValueOnce(
      makeTx({ notes: 'updated', amountIls: 250 })
    );

    const res = await PUT(
      req('PUT', {
        notes: 'updated',
        amountIls: 250,
        transactionDate: '2026-02-01',
        paymentDate: null,
        isRecurring: true,
        excludedFromFlow: true,
        tagIds: ['tag-1'],
      }),
      params()
    );
    expect(res.status).toBe(200);

    const updateArg = (mockPrisma.budgetTransaction.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.data.notes).toBe('updated');
    expect(updateArg.data.amountIls).toBe(250);
    expect(updateArg.data.transactionDate).toBeInstanceOf(Date);
    expect(updateArg.data.paymentDate).toBeNull();
    expect(updateArg.data.isRecurring).toBe(true);
    expect(updateArg.data.excludedFromFlow).toBe(true);

    // Old links removed, new link created.
    expect(mockPrisma.budgetTransactionTag.delete).toHaveBeenCalledWith({
      where: { id: 'link-1' },
    });
    expect(mockPrisma.budgetTransactionTag.create).toHaveBeenCalledWith({
      data: { transactionId: 'tx-1', tagId: 'tag-1' },
    });

    const json = await res.json();
    expect(json.data.notes).toBe('updated');
  });
});

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------
describe('DELETE /api/budget/transactions/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(401);
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the transaction is missing / in another household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await DELETE(req('DELETE'), params('missing'));
    expect(res.status).toBe(404);
    expect(mockPrisma.budgetTransaction.update).not.toHaveBeenCalled();
  });

  it('soft-deletes the transaction (scoped by id) and its split children', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.budgetTransaction.findFirst as jest.Mock).mockResolvedValueOnce(makeTx());
    (mockPrisma.budgetTransaction.update as jest.Mock).mockResolvedValue(makeTx());
    (mockPrisma.budgetTransaction.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'child-1' }]);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe('tx-1');

    // Parent soft-deleted, scoped by id.
    expect(mockPrisma.budgetTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { isDeleted: true },
    });
    // Child soft-deleted too.
    expect(mockPrisma.budgetTransaction.update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { isDeleted: true },
    });
  });
});
