/**
 * Integration tests for /api/budget/payee-rules/[id] (PUT + DELETE).
 * Covers auth, not-found/ownership, zod + route-level validation, category
 * ownership, the markNeverDefault vs categoryId mode inference, and errors.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: {
    payeeCategoryRule: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    budgetCategory: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { PUT, DELETE } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 't@x.com', name: 'Me' },
  profile: { id: 'profile-1', name: 'Me', image: null, color: '#3b82f6', userId: 'user-1' },
  households: [{ id: 'hh-1', name: 'Home', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'hh-1', name: 'Home', description: null, role: 'owner' as const },
  householdProfiles: [],
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const putReq = (id: string, body: unknown) =>
  new NextRequest(`http://localhost/api/budget/payee-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

// A full rule row as returned by prisma.payeeCategoryRule.update (with category include).
const fullRule = (overrides: Record<string, unknown> = {}) => ({
  id: 'rule-1',
  name: 'Rule',
  operator: 'contains',
  value: 'foo',
  categoryId: 'cat-1',
  markNeverDefault: false,
  sortOrder: 0,
  isActive: true,
  householdId: 'hh-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  category: { name: 'Groceries' },
  ...overrides,
});

describe('PUT /api/budget/payee-rules/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await PUT(putReq('rule-1', { name: 'x' }), params('rule-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the rule is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await PUT(putReq('rule-1', { name: 'x' }), params('rule-1'));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Rule not found');
  });

  it('returns 400 when zod rejects setting both category and markNeverDefault', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: 'cat-1', markNeverDefault: false })
    );
    const res = await PUT(
      putReq('rule-1', { markNeverDefault: true, categoryId: 'cat-1' }),
      params('rule-1')
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('returns 400 (route-level) when the resulting rule would have both a category and markNeverDefault', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    // Existing rule already markNeverDefault; body only adds a categoryId (zod allows this).
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: null, markNeverDefault: true })
    );
    const res = await PUT(putReq('rule-1', { categoryId: 'cat-1' }), params('rule-1'));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('A rule cannot have both a category and markNeverDefault');
  });

  it('returns 400 (route-level) when the resulting rule would have neither', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: 'cat-1', markNeverDefault: false })
    );
    const res = await PUT(putReq('rule-1', { categoryId: null }), params('rule-1'));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe('A rule must have either a category or markNeverDefault');
  });

  it('returns 404 when the target category is not in the household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: 'old-cat', markNeverDefault: false })
    );
    (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await PUT(putReq('rule-1', { categoryId: 'cat-new' }), params('rule-1'));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Category not found');
  });

  it('updates a rule with a new category and returns the transformed record', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: 'old-cat', markNeverDefault: false })
    );
    (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'cat-1' });
    (mockPrisma.payeeCategoryRule.update as jest.Mock).mockResolvedValueOnce(
      fullRule({
        name: 'Renamed',
        operator: 'starts_with',
        value: 'bar',
        categoryId: 'cat-1',
        sortOrder: 3,
        isActive: false,
      })
    );

    const res = await PUT(
      putReq('rule-1', {
        name: 'Renamed',
        operator: 'starts_with',
        value: 'bar',
        categoryId: 'cat-1',
        sortOrder: 3,
        isActive: false,
      }),
      params('rule-1')
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.categoryId).toBe('cat-1');
    expect(data.data.categoryName).toBe('Groceries');
    expect(data.data.name).toBe('Renamed');
    expect(data.data.markNeverDefault).toBe(false);

    const updateArgs = (mockPrisma.payeeCategoryRule.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'rule-1' });
    expect(updateArgs.data.categoryId).toBe('cat-1');
    expect(updateArgs.data.markNeverDefault).toBe(false);
  });

  it('updates a rule to markNeverDefault, clearing the category without a category lookup', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: 'cat-1', markNeverDefault: false })
    );
    (mockPrisma.payeeCategoryRule.update as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: null, markNeverDefault: true, category: null })
    );

    const res = await PUT(putReq('rule-1', { markNeverDefault: true }), params('rule-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.markNeverDefault).toBe(true);
    expect(data.data.categoryId).toBeNull();
    expect(data.data.categoryName).toBeNull();
    // No category ownership check because willCategoryId is null.
    expect(mockPrisma.budgetCategory.findFirst).not.toHaveBeenCalled();
    const updateArgs = (mockPrisma.payeeCategoryRule.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.categoryId).toBeNull();
    expect(updateArgs.data.markNeverDefault).toBe(true);
  });

  it('returns 500 when the update fails', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ categoryId: 'old-cat', markNeverDefault: false })
    );
    (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'cat-1' });
    (mockPrisma.payeeCategoryRule.update as jest.Mock).mockRejectedValueOnce(new Error('db down'));

    const res = await PUT(putReq('rule-1', { categoryId: 'cat-1' }), params('rule-1'));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to update payee category rule');
  });
});

describe('DELETE /api/budget/payee-rules/[id]', () => {
  beforeEach(() => jest.resetAllMocks());

  const delReq = (id: string) =>
    new NextRequest(`http://localhost/api/budget/payee-rules/${id}`, { method: 'DELETE' });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(null);
    const res = await DELETE(delReq('rule-1'), params('rule-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the rule is not in the active household', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(null);
    const res = await DELETE(delReq('rule-1'), params('rule-1'));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Rule not found');
  });

  it('deletes an owned rule', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ id: 'rule-1' })
    );
    (mockPrisma.payeeCategoryRule.delete as jest.Mock).mockResolvedValueOnce({});

    const res = await DELETE(delReq('rule-1'), params('rule-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('rule-1');
    expect(mockPrisma.payeeCategoryRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
  });

  it('returns 500 when the delete fails', async () => {
    mockGetCurrentContext.mockResolvedValueOnce(mockContext);
    (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(
      fullRule({ id: 'rule-1' })
    );
    (mockPrisma.payeeCategoryRule.delete as jest.Mock).mockRejectedValueOnce(new Error('db down'));

    const res = await DELETE(delReq('rule-1'), params('rule-1'));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to delete payee category rule');
  });
});
