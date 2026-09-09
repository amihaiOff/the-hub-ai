jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    taskCategory: { count: jest.fn() },
    taskTag: { count: jest.fn() },
    profile: { count: jest.fn() },
  },
}));

import { prisma } from '@/lib/db';
import {
  assertParentAllowed,
  assertNotConvertingParentToChild,
  assertRelationsInHousehold,
  TaskValidationError,
} from '../validation';

const mockFindUnique = prisma.task.findUnique as jest.Mock;
const mockCount = prisma.task.count as jest.Mock;
const mockCategoryCount = prisma.taskCategory.count as jest.Mock;
const mockTagCount = prisma.taskTag.count as jest.Mock;
const mockProfileCount = prisma.profile.count as jest.Mock;

describe('assertParentAllowed', () => {
  beforeEach(() => jest.resetAllMocks());

  it('is a no-op when parentTaskId is null/undefined', async () => {
    await expect(assertParentAllowed(null, 'hh-1')).resolves.toBeUndefined();
    await expect(assertParentAllowed(undefined, 'hh-1')).resolves.toBeUndefined();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('rejects when the parent lives in a different household', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'p1', parentTaskId: null, householdId: 'other' });
    await expect(assertParentAllowed('p1', 'hh-1')).rejects.toBeInstanceOf(TaskValidationError);
  });

  it('rejects when the parent itself has a parent (would nest two deep)', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'p1', parentTaskId: 'root', householdId: 'hh-1' });
    await expect(assertParentAllowed('p1', 'hh-1')).rejects.toThrow(/only nest one level/);
  });

  it('accepts a top-level parent in the same household', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'p1', parentTaskId: null, householdId: 'hh-1' });
    await expect(assertParentAllowed('p1', 'hh-1')).resolves.toBeUndefined();
  });
});

describe('assertNotConvertingParentToChild', () => {
  beforeEach(() => jest.resetAllMocks());

  it('accepts a task with no children', async () => {
    mockCount.mockResolvedValueOnce(0);
    await expect(assertNotConvertingParentToChild('t1')).resolves.toBeUndefined();
  });

  it('rejects a task that already has children', async () => {
    mockCount.mockResolvedValueOnce(2);
    await expect(assertNotConvertingParentToChild('t1')).rejects.toBeInstanceOf(
      TaskValidationError
    );
  });
});

describe('assertRelationsInHousehold', () => {
  beforeEach(() => jest.resetAllMocks());

  it('is a no-op when nothing is referenced', async () => {
    await expect(assertRelationsInHousehold({}, 'hh-1')).resolves.toBeUndefined();
    await expect(
      assertRelationsInHousehold({ categoryId: null, assigneeId: null, tagIds: [] }, 'hh-1')
    ).resolves.toBeUndefined();
    expect(mockCategoryCount).not.toHaveBeenCalled();
    expect(mockProfileCount).not.toHaveBeenCalled();
    expect(mockTagCount).not.toHaveBeenCalled();
  });

  it('rejects a category from another household', async () => {
    mockCategoryCount.mockResolvedValueOnce(0);
    await expect(assertRelationsInHousehold({ categoryId: 'c1' }, 'hh-1')).rejects.toThrow(
      /Unknown category/
    );
  });

  it('rejects an assignee who is not a member of the household', async () => {
    mockProfileCount.mockResolvedValueOnce(0);
    await expect(assertRelationsInHousehold({ assigneeId: 'p1' }, 'hh-1')).rejects.toThrow(
      /Unknown assignee/
    );
  });

  it('rejects when any one tag is unknown', async () => {
    // Two ids requested, only one found.
    mockTagCount.mockResolvedValueOnce(1);
    await expect(assertRelationsInHousehold({ tagIds: ['t1', 't2'] }, 'hh-1')).rejects.toThrow(
      /Unknown tag/
    );
  });

  it('de-duplicates repeated tag ids before counting', async () => {
    mockTagCount.mockResolvedValueOnce(1);
    await expect(
      assertRelationsInHousehold({ tagIds: ['t1', 't1'] }, 'hh-1')
    ).resolves.toBeUndefined();
    expect(mockTagCount).toHaveBeenCalledWith({
      where: { id: { in: ['t1'] }, householdId: 'hh-1' },
    });
  });

  it('accepts a fully valid set', async () => {
    mockCategoryCount.mockResolvedValueOnce(1);
    mockProfileCount.mockResolvedValueOnce(1);
    mockTagCount.mockResolvedValueOnce(2);
    await expect(
      assertRelationsInHousehold(
        { categoryId: 'c1', assigneeId: 'p1', tagIds: ['t1', 't2'] },
        'hh-1'
      )
    ).resolves.toBeUndefined();
  });

  it('throws TaskValidationError so routes map it to a 400, not a 500', async () => {
    mockCategoryCount.mockResolvedValueOnce(0);
    await expect(assertRelationsInHousehold({ categoryId: 'c1' }, 'hh-1')).rejects.toBeInstanceOf(
      TaskValidationError
    );
  });
});
