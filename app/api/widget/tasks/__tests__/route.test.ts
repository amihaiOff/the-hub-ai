/**
 * Tests for GET /api/widget/tasks (KWGT widget feed).
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/db', () => ({
  prisma: { taskCategory: { findMany: jest.fn() }, task: { findMany: jest.fn() } },
}));

jest.mock('@/lib/auth-api-key', () => ({
  getHouseholdIdFromWidgetToken: jest.fn(),
  resolveHouseholdOwnerUserId: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getHouseholdIdFromWidgetToken, resolveHouseholdOwnerUserId } from '@/lib/auth-api-key';
import { GET } from '../route';

const mockAuth = getHouseholdIdFromWidgetToken as jest.Mock;
const mockOwner = resolveHouseholdOwnerUserId as jest.Mock;
const mockCategories = prisma.taskCategory.findMany as jest.Mock;
const mockTasks = prisma.task.findMany as jest.Mock;

const req = () => new NextRequest('http://localhost/api/widget/tasks?token=abc');

describe('GET /api/widget/tasks', () => {
  beforeEach(() => jest.resetAllMocks());

  it('401s without a valid token', async () => {
    mockAuth.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockAuth).toHaveBeenCalledWith('abc');
    expect(mockTasks).not.toHaveBeenCalled();
  });

  it('groups open tasks by category, caps at 10, drops empty, uncategorised last', async () => {
    mockAuth.mockResolvedValueOnce('hh-1');
    mockOwner.mockResolvedValueOnce('u-1');
    mockCategories.mockResolvedValueOnce([
      { id: 'c-home', name: 'Home' },
      { id: 'c-empty', name: 'Empty' },
      { id: 'c-work', name: 'Work' },
    ]);
    mockTasks.mockResolvedValueOnce([
      ...Array.from({ length: 12 }, (_, i) => ({ title: `H${i}`, categoryId: 'c-home' })),
      { title: 'Loose', categoryId: null },
      { title: 'W0', categoryId: 'c-work' },
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(3);
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Home',
      'Work',
      'Uncategorized',
    ]);
    expect(body.categories[0].total).toBe(12);
    expect(body.categories[0].tasks).toHaveLength(10);
    expect(body.categories[0].tasks[0]).toBe('H0');
    expect(body.categories[2].tasks).toEqual(['Loose']);
    expect(mockTasks.mock.calls[0][0].where).toMatchObject({
      householdId: 'hh-1',
      done: false,
      parentTaskId: null,
    });
  });
});
