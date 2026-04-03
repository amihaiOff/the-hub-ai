/**
 * Integration tests for PUT /api/budget/categories/merge
 * Tests category merge operation with authentication and authorization
 */

import { NextRequest } from 'next/server';

const createDecimal = (value: number) => ({
  toNumber: () => value,
  toString: () => String(value),
  valueOf: () => value,
});

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetCategory: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    budgetTransaction: {
      updateMany: jest.fn(),
    },
    budgetPayee: {
      updateMany: jest.fn(),
    },
    payeeCategoryRule: {
      updateMany: jest.fn(),
    },
    riseupCategory: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { PUT } from '../route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('PUT /api/budget/categories/merge', () => {
  const mockContext = {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    profile: {
      id: 'profile-1',
      name: 'Test Profile',
      image: null,
      color: null,
      userId: 'user-1',
    },
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

  const sourceCategory = {
    id: 'cat-source',
    name: 'Source Category',
    budget: createDecimal(500),
    isMust: false,
    sortOrder: 1,
    groupId: 'group-1',
    householdId: 'household-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const targetCategory = {
    id: 'cat-target',
    name: 'Target Category',
    budget: createDecimal(1000),
    isMust: true,
    sortOrder: 2,
    groupId: 'group-1',
    householdId: 'household-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost:3001/api/budget/categories/merge', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
    );
  });

  it('should return 401 when not authenticated', async () => {
    mockGetCurrentContext.mockResolvedValue(null);

    const request = createRequest({
      sourceCategoryId: 'cat-source',
      targetCategoryId: 'cat-target',
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Unauthorized');
  });

  it('should merge source category into target category successfully', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.budgetCategory.findFirst as jest.Mock)
      .mockResolvedValueOnce(sourceCategory)
      .mockResolvedValueOnce(targetCategory);
    (mockPrisma.budgetTransaction.updateMany as jest.Mock).mockResolvedValue({ count: 10 });
    (mockPrisma.budgetPayee.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (mockPrisma.payeeCategoryRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.riseupCategory.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.budgetCategory.update as jest.Mock).mockResolvedValue({
      ...targetCategory,
      budget: createDecimal(1500),
    });
    (mockPrisma.budgetCategory.delete as jest.Mock).mockResolvedValue(sourceCategory);

    const request = createRequest({
      sourceCategoryId: 'cat-source',
      targetCategoryId: 'cat-target',
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.targetCategoryId).toBe('cat-target');
    expect(data.data.transactionsMoved).toBe(10);
    expect(data.data.payeesUpdated).toBe(3);

    // Verify transactions were moved
    expect(mockPrisma.budgetTransaction.updateMany).toHaveBeenCalledWith({
      where: { categoryId: 'cat-source', householdId: 'household-1' },
      data: { categoryId: 'cat-target' },
    });

    // Verify payees were updated
    expect(mockPrisma.budgetPayee.updateMany).toHaveBeenCalledWith({
      where: { categoryId: 'cat-source', householdId: 'household-1' },
      data: { categoryId: 'cat-target' },
    });

    // Verify payee rules were updated
    expect(mockPrisma.payeeCategoryRule.updateMany).toHaveBeenCalledWith({
      where: { categoryId: 'cat-source', householdId: 'household-1' },
      data: { categoryId: 'cat-target' },
    });

    // Verify riseup mappings were updated
    expect(mockPrisma.riseupCategory.updateMany).toHaveBeenCalledWith({
      where: { budgetCategoryId: 'cat-source', householdId: 'household-1' },
      data: { budgetCategoryId: 'cat-target' },
    });

    // Verify budgets were merged (500 + 1000 = 1500)
    expect(mockPrisma.budgetCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-target' },
      data: { budget: 1500 },
    });

    // Verify source was deleted
    expect(mockPrisma.budgetCategory.delete).toHaveBeenCalledWith({
      where: { id: 'cat-source' },
    });
  });

  it('should return 404 when source category not found', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.budgetCategory.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // source not found
      .mockResolvedValueOnce(targetCategory);

    const request = createRequest({
      sourceCategoryId: 'nonexistent',
      targetCategoryId: 'cat-target',
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Source category not found');
  });

  it('should return 404 when target category not found', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);
    (mockPrisma.budgetCategory.findFirst as jest.Mock)
      .mockResolvedValueOnce(sourceCategory)
      .mockResolvedValueOnce(null); // target not found

    const request = createRequest({
      sourceCategoryId: 'cat-source',
      targetCategoryId: 'nonexistent',
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Target category not found');
  });

  it('should return 400 when source and target are the same category', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const request = createRequest({
      sourceCategoryId: 'cat-same',
      targetCategoryId: 'cat-same',
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('must be different');
  });

  it('should return 400 when required fields are missing', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const request = createRequest({});

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('should not update target budget when combined budget is zero', async () => {
    mockGetCurrentContext.mockResolvedValue(mockContext);

    const sourceCatNoBudget = { ...sourceCategory, budget: null };
    const targetCatNoBudget = { ...targetCategory, budget: null };

    (mockPrisma.budgetCategory.findFirst as jest.Mock)
      .mockResolvedValueOnce(sourceCatNoBudget)
      .mockResolvedValueOnce(targetCatNoBudget);
    (mockPrisma.budgetTransaction.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.budgetPayee.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.payeeCategoryRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.riseupCategory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.budgetCategory.delete as jest.Mock).mockResolvedValue(sourceCatNoBudget);

    const request = createRequest({
      sourceCategoryId: 'cat-source',
      targetCategoryId: 'cat-target',
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Budget update should NOT be called when combined is 0
    expect(mockPrisma.budgetCategory.update).not.toHaveBeenCalled();

    // Source should still be deleted
    expect(mockPrisma.budgetCategory.delete).toHaveBeenCalledWith({
      where: { id: 'cat-source' },
    });
  });
});
