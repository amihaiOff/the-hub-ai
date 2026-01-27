/**
 * Integration tests for /api/budget/tags routes
 * Tests tags CRUD operations with authentication and authorization
 */

import { NextRequest } from 'next/server';

// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    budgetTag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    budgetTransactionTag: {
      findMany: jest.fn(),
      create: jest.fn(),
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
import { GET, POST, PUT } from '../route';
import { GET as GET_BY_ID, PUT as PUT_BY_ID, DELETE } from '../[id]/route';

const mockGetCurrentContext = getCurrentContext as jest.MockedFunction<typeof getCurrentContext>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Tags API', () => {
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

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/budget/tags', () => {
    it('should return all tags with transaction counts', async () => {
      const mockTags = [
        {
          id: 'tag-1',
          name: 'Work',
          color: '#ff0000',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { transactionTags: 5 },
        },
        {
          id: 'tag-2',
          name: 'Personal',
          color: '#00ff00',
          householdId: 'household-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { transactionTags: 3 },
        },
      ];

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce(mockTags);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Work');
      expect(data.data[0].color).toBe('#ff0000');
      expect(data.data[0].transactionCount).toBe(5);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle empty tags list', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to fetch tags');
    });
  });

  describe('POST /api/budget/tags', () => {
    it('should create a tag successfully', async () => {
      const mockTag = {
        id: 'tag-1',
        name: 'New Tag',
        color: '#0000ff',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.create as jest.Mock).mockResolvedValueOnce(mockTag);

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Tag', color: '#0000ff' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Tag');
      expect(data.data.color).toBe('#0000ff');
      expect(data.data.transactionCount).toBe(0);
    });

    it('should create a tag without color', async () => {
      const mockTag = {
        id: 'tag-1',
        name: 'New Tag',
        color: null,
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.create as jest.Mock).mockResolvedValueOnce(mockTag);

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Tag' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.color).toBeNull();
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when name is missing', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 for duplicate name', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.create as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed on the constraint')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'Existing Tag' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('A tag with this name already exists');
    });

    it('should return 500 on database error', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.create as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Tag' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create tag');
    });
  });

  describe('PUT /api/budget/tags (merge)', () => {
    it('should merge tags successfully', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'Tag 1', householdId: 'household-1' },
        { id: 'tag-2', name: 'Tag 2', householdId: 'household-1' },
        { id: 'tag-3', name: 'Tag 3', householdId: 'household-1' },
      ];

      const mockSourceLinks = [
        { transactionId: 'tx-1', tagId: 'tag-1' },
        { transactionId: 'tx-2', tagId: 'tag-2' },
      ];

      const mockExistingTargetLinks = [
        { transactionId: 'tx-1' }, // tx-1 already has target tag
      ];

      const mockUpdatedTag = {
        id: 'tag-3',
        name: 'Tag 3',
        color: '#ff0000',
        householdId: 'household-1',
        _count: { transactionTags: 2 },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce(mockTags); // Verify all tags
      (mockPrisma.budgetTransactionTag.findMany as jest.Mock)
        .mockResolvedValueOnce(mockSourceLinks) // Source links
        .mockResolvedValueOnce(mockExistingTargetLinks); // Existing target links
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce(undefined);
      (mockPrisma.budgetTag.findUnique as jest.Mock).mockResolvedValueOnce(mockUpdatedTag);

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'PUT',
        body: JSON.stringify({
          sourceTagIds: ['tag-1', 'tag-2'],
          targetTagId: 'tag-3',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tag-3');
      expect(data.data.mergedCount).toBe(2);
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'PUT',
        body: JSON.stringify({
          sourceTagIds: ['tag-1'],
          targetTagId: 'tag-2',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 when validation fails', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'PUT',
        body: JSON.stringify({
          sourceTagIds: [],
          targetTagId: 'tag-2',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 when tags not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'tag-1', householdId: 'household-1' },
      ]); // Only 1 of 3 found

      const request = new NextRequest('http://localhost:3000/api/budget/tags', {
        method: 'PUT',
        body: JSON.stringify({
          sourceTagIds: ['tag-1', 'tag-2'],
          targetTagId: 'tag-3',
        }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('One or more tags not found');
    });
  });

  describe('GET /api/budget/tags/[id]', () => {
    it('should return a specific tag', async () => {
      const mockTag = {
        id: 'tag-1',
        name: 'Work',
        color: '#ff0000',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { transactionTags: 5 },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(mockTag);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tag-1');
      expect(data.data.transactionCount).toBe(5);
    });

    it('should return 404 when tag not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/invalid');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Tag not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1');
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('PUT /api/budget/tags/[id]', () => {
    it('should update a tag successfully', async () => {
      const mockExisting = {
        id: 'tag-1',
        name: 'Old Name',
        color: '#ff0000',
        householdId: 'household-1',
      };
      const mockUpdated = {
        id: 'tag-1',
        name: 'Updated Name',
        color: '#00ff00',
        householdId: 'household-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { transactionTags: 3 },
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetTag.update as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name', color: '#00ff00' }),
      });

      const response = await PUT_BY_ID(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
      expect(data.data.color).toBe('#00ff00');
    });

    it('should return 404 when tag not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/invalid', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT_BY_ID(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Tag not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Test' }),
      });

      const response = await PUT_BY_ID(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 400 for duplicate name', async () => {
      const mockExisting = {
        id: 'tag-1',
        name: 'Old Name',
        color: '#ff0000',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetTag.update as jest.Mock).mockRejectedValueOnce(
        new Error('Unique constraint failed on the constraint')
      );

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Existing Name' }),
      });

      const response = await PUT_BY_ID(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('A tag with this name already exists');
    });
  });

  describe('DELETE /api/budget/tags/[id]', () => {
    it('should delete a tag successfully', async () => {
      const mockExisting = {
        id: 'tag-1',
        name: 'Tag',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetTag.delete as jest.Mock).mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tag-1');
    });

    it('should return 404 when tag not found', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/invalid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'invalid' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Tag not found');
    });

    it('should return 401 when not authenticated', async () => {
      mockGetCurrentContext.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      const mockExisting = {
        id: 'tag-1',
        name: 'Tag',
        householdId: 'household-1',
      };

      mockGetCurrentContext.mockResolvedValueOnce(mockContext);
      (mockPrisma.budgetTag.findFirst as jest.Mock).mockResolvedValueOnce(mockExisting);
      (mockPrisma.budgetTag.delete as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      const request = new NextRequest('http://localhost:3000/api/budget/tags/tag-1', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'tag-1' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete tag');
    });
  });
});
