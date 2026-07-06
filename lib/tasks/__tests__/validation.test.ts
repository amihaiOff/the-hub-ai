jest.mock('@/lib/db', () => ({
  prisma: {
    task: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  assertParentAllowed,
  assertNotConvertingParentToChild,
  TaskValidationError,
} from '../validation';

const mockFindUnique = prisma.task.findUnique as jest.Mock;
const mockCount = prisma.task.count as jest.Mock;

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
