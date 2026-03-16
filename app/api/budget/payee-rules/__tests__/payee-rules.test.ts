/**
 * Integration tests for /api/budget/payee-rules routes
 * Tests CRUD operations and bulk-apply for payee categorization rules
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    payeeCategoryRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    budgetCategory: {
      findFirst: jest.fn(),
    },
    budgetPayee: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

// Mock auth utilities
jest.mock('@/lib/auth-utils', () => ({
  getCurrentContext: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getCurrentContext } from '@/lib/auth-utils';
import { GET, POST } from '../route';
import { PUT, DELETE } from '../[id]/route';
import { POST as APPLY_BULK } from '../apply/route';
import { POST as APPLY_SINGLE } from '../[id]/apply/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockContext = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  profile: { id: 'profile-1', name: 'Test', image: null, color: null, userId: 'user-1' },
  households: [{ id: 'household-1', name: 'Test', description: null, role: 'owner' as const }],
  activeHousehold: { id: 'household-1', name: 'Test', description: null, role: 'owner' as const },
  householdProfiles: [
    {
      id: 'profile-1',
      name: 'Test',
      image: null,
      color: null,
      role: 'owner' as const,
      hasUser: true,
    },
  ],
};

describe('Payee Category Rules API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/budget/payee-rules', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const response = await GET();
      expect(response.status).toBe(401);
    });

    it('should return rules ordered by sortOrder', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: 'rule-1',
          name: 'Supermarkets',
          operator: 'contains',
          value: 'shufersal',
          categoryId: 'cat-1',
          sortOrder: 0,
          isActive: true,
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Groceries' },
        },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('Supermarkets');
      expect(data.data[0].categoryName).toBe('Groceries');
    });
  });

  describe('POST /api/budget/payee-rules', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test',
          operator: 'contains',
          value: 'test',
          categoryId: 'cat-1',
        }),
      });
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should create a rule', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'cat-1',
        name: 'Groceries',
      });
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce({
        sortOrder: 2,
      });
      (mockPrisma.payeeCategoryRule.create as jest.Mock).mockResolvedValueOnce({
        id: 'rule-1',
        name: 'Supermarkets',
        operator: 'contains',
        value: 'shufersal',
        categoryId: 'cat-1',
        sortOrder: 3,
        isActive: true,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Supermarkets',
          operator: 'contains',
          value: 'shufersal',
          categoryId: 'cat-1',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.name).toBe('Supermarkets');
      expect(data.data.categoryName).toBe('Groceries');
    });

    it('should return 400 for invalid input', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules', {
        method: 'POST',
        body: JSON.stringify({ name: '', operator: 'invalid', value: '', categoryId: '' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('should return 404 when category not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetCategory.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test',
          operator: 'contains',
          value: 'test',
          categoryId: 'nonexistent',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/budget/payee-rules/[id]', () => {
    it('should return 404 when rule not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules/nonexistent', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      expect(response.status).toBe(404);
    });

    it('should update a rule', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'rule-1',
        householdId: 'household-1',
      });
      (mockPrisma.payeeCategoryRule.update as jest.Mock).mockResolvedValueOnce({
        id: 'rule-1',
        name: 'Updated Rule',
        operator: 'contains',
        value: 'test',
        categoryId: 'cat-1',
        sortOrder: 0,
        isActive: true,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { name: 'Groceries' },
      });

      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules/rule-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Rule' }),
      });

      const response = await PUT(request, { params: Promise.resolve({ id: 'rule-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.name).toBe('Updated Rule');
    });
  });

  describe('DELETE /api/budget/payee-rules/[id]', () => {
    it('should return 404 when rule not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules/nonexistent', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });
      expect(response.status).toBe(404);
    });

    it('should delete a rule', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'rule-1',
        householdId: 'household-1',
      });
      (mockPrisma.payeeCategoryRule.delete as jest.Mock).mockResolvedValueOnce({ id: 'rule-1' });

      const request = new NextRequest('http://localhost:3000/api/budget/payee-rules/rule-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'rule-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.id).toBe('rule-1');
    });
  });

  describe('POST /api/budget/payee-rules/apply (bulk)', () => {
    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const response = await APPLY_BULK();
      expect(response.status).toBe(401);
    });

    it('should return 0/0 when no rules exist', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await APPLY_BULK();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual({ matched: 0, total: 0 });
    });

    it('should apply rules to uncategorized payees', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findMany as jest.Mock).mockResolvedValueOnce([
        { operator: 'contains', value: 'shufersal', categoryId: 'cat-1', isActive: true },
      ]);
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Shufersal Deal' },
        { id: 'payee-2', name: 'Unknown Store' },
      ]);
      (mockPrisma.budgetPayee.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const response = await APPLY_BULK();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.matched).toBe(1);
      expect(data.data.total).toBe(2);
      expect(mockPrisma.budgetPayee.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['payee-1'] } },
        data: { categoryId: 'cat-1' },
      });
    });
  });

  describe('POST /api/budget/payee-rules/[id]/apply (single)', () => {
    const makeRequest = () =>
      new NextRequest('http://localhost:3000/api/budget/payee-rules/rule-1/apply', {
        method: 'POST',
      });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);
      const response = await APPLY_SINGLE(makeRequest(), {
        params: Promise.resolve({ id: 'rule-1' }),
      });
      expect(response.status).toBe(401);
    });

    it('should return 404 when rule not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const response = await APPLY_SINGLE(makeRequest(), {
        params: Promise.resolve({ id: 'nonexistent' }),
      });
      expect(response.status).toBe(404);
    });

    it('should apply a single rule to uncategorized payees', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce({
        operator: 'contains',
        value: 'shufersal',
        categoryId: 'cat-1',
        isActive: true,
      });
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Shufersal Deal' },
        { id: 'payee-2', name: 'Unknown Store' },
      ]);
      (mockPrisma.budgetPayee.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const response = await APPLY_SINGLE(makeRequest(), {
        params: Promise.resolve({ id: 'rule-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.matched).toBe(1);
      expect(data.data.total).toBe(2);
      expect(mockPrisma.budgetPayee.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['payee-1'] } },
        data: { categoryId: 'cat-1' },
      });
    });

    it('should return 0 matched when no payees match', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.payeeCategoryRule.findFirst as jest.Mock).mockResolvedValueOnce({
        operator: 'equals',
        value: 'exact-match',
        categoryId: 'cat-1',
        isActive: true,
      });
      (mockPrisma.budgetPayee.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'payee-1', name: 'Something Else' },
      ]);

      const response = await APPLY_SINGLE(makeRequest(), {
        params: Promise.resolve({ id: 'rule-1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.matched).toBe(0);
      expect(data.data.total).toBe(1);
      expect(mockPrisma.budgetPayee.updateMany).not.toHaveBeenCalled();
    });
  });
});
