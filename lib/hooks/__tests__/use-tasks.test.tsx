/**
 * Unit tests for task hooks (TanStack Query)
 * Exercises query keys, query hooks, mutation hooks, and the optimistic
 * onMutate/onError/onSettled callbacks.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  taskKeys,
  useTasks,
  useTask,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useTaskCategories,
  useCreateTaskCategory,
  useUpdateTaskCategory,
  useDeleteTaskCategory,
  useReorderTaskCategories,
  useTaskTags,
  useCreateTaskTag,
  useDeleteTaskTag,
  type TaskRow,
  type TaskCategoryRow,
} from '../use-tasks';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

function ok<T>(data: T) {
  return { ok: true, json: async () => ({ success: true, data }) };
}

function err(error = 'boom') {
  return { ok: false, json: async () => ({ success: false, error }) };
}

// Build a QueryClient we can also inspect / seed from tests.
// gcTime: Infinity keeps optimistically-patched entries in the cache so tests
// can inspect them after onSettled invalidation (no observer is subscribed to
// those keys, so an invalidate would otherwise let gcTime:0 evict them).
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createWrapper() {
  return wrapperFor(makeClient());
}

// Minimal task row factory
function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 't-1',
    title: 'Task 1',
    notes: null,
    status: 'todo' as TaskRow['status'],
    priority: 'medium' as TaskRow['priority'],
    dueDate: null,
    sortOrder: 0,
    customFields: null,
    categoryId: null,
    ownerId: 'u-1',
    assigneeId: null,
    parentTaskId: null,
    householdId: 'h-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    category: null,
    assignee: null,
    tags: [],
    shares: [],
    ...overrides,
  };
}

function makeCategory(overrides: Partial<TaskCategoryRow> = {}): TaskCategoryRow {
  return {
    id: 'c-1',
    name: 'Home',
    color: '#fff',
    icon: null,
    sortOrder: 0,
    householdId: 'h-1',
    ...overrides,
  };
}

describe('Task Hooks', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── taskKeys ──────────────────────────────────────────────────────────
  describe('taskKeys', () => {
    it('all', () => {
      expect(taskKeys.all).toEqual(['tasks']);
    });

    it('lists', () => {
      expect(taskKeys.lists()).toEqual(['tasks', 'list']);
    });

    it('list without filters uses empty object', () => {
      expect(taskKeys.list()).toEqual(['tasks', 'list', {}]);
    });

    it('list with filters', () => {
      const filters = { status: 'TODO' as const };
      expect(taskKeys.list(filters)).toEqual(['tasks', 'list', filters]);
    });

    it('details', () => {
      expect(taskKeys.details()).toEqual(['tasks', 'detail']);
    });

    it('detail', () => {
      expect(taskKeys.detail('abc')).toEqual(['tasks', 'detail', 'abc']);
    });

    it('categories', () => {
      expect(taskKeys.categories()).toEqual(['task-categories']);
    });

    it('tags', () => {
      expect(taskKeys.tags()).toEqual(['task-tags']);
    });
  });

  // ─── useTasks ──────────────────────────────────────────────────────────
  describe('useTasks', () => {
    it('fetches the task list without filters', async () => {
      const tasks = [makeTask()];
      mockFetch.mockResolvedValueOnce(ok(tasks));

      const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(tasks);
      expect(mockFetch).toHaveBeenCalledWith('/api/tasks', expect.any(Object));
    });

    it('serializes filters into the query string (toQuery)', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));

      const { result } = renderHook(
        () =>
          useTasks({
            status: 'todo' as never,
            priority: 'high' as never,
            search: 'buy milk',
            categoryId: undefined as never,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/api/tasks?');
      expect(url).toContain('status=todo');
      expect(url).toContain('priority=high');
      expect(url).toContain('search=buy+milk');
      // undefined values are skipped
      expect(url).not.toContain('categoryId');
    });

    it('produces no query string when filters is an empty object', async () => {
      mockFetch.mockResolvedValueOnce(ok([]));

      const { result } = renderHook(() => useTasks({}), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith('/api/tasks', expect.any(Object));
    });

    it('surfaces API errors', async () => {
      mockFetch.mockResolvedValueOnce(err('nope'));

      const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('nope');
    });
  });

  // ─── useTask ───────────────────────────────────────────────────────────
  describe('useTask', () => {
    it('fetches a single task by id', async () => {
      const task = makeTask({ id: 't-42' });
      mockFetch.mockResolvedValueOnce(ok(task));

      const { result } = renderHook(() => useTask('t-42'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(task);
      expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t-42', expect.any(Object));
    });

    it('is disabled when id is null (enabled:false branch)', async () => {
      const { result } = renderHook(() => useTask(null), { wrapper: createWrapper() });

      // Query never runs: pending status but idle fetch, no fetch call.
      await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
      expect(result.current.status).toBe('pending');
      expect(result.current.data).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── useCreateTask ─────────────────────────────────────────────────────
  describe('useCreateTask', () => {
    it('POSTs a new task', async () => {
      const created = makeTask({ id: 't-new', title: 'New' });
      mockFetch.mockResolvedValueOnce(ok(created));

      const { result } = renderHook(() => useCreateTask(), { wrapper: createWrapper() });

      result.current.mutate({ title: 'New' } as never);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(created);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'New' }),
        })
      );
    });

    it('errors when the API rejects', async () => {
      mockFetch.mockResolvedValueOnce(err('bad'));

      const { result } = renderHook(() => useCreateTask(), { wrapper: createWrapper() });

      result.current.mutate({ title: '' } as never);

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe('bad');
    });
  });

  // ─── useUpdateTask (optimistic) ────────────────────────────────────────
  describe('useUpdateTask', () => {
    it('PATCHes a task and patches the cache optimistically', async () => {
      const client = makeClient();
      const wrapper = wrapperFor(client);

      // Seed a cached list and detail so onMutate patches them.
      const listKey = taskKeys.list();
      const original = makeTask({ id: 't-1', title: 'Old' });
      client.setQueryData(listKey, [original]);
      client.setQueryData(taskKeys.detail('t-1'), original);

      const updated = makeTask({ id: 't-1', title: 'Renamed' });
      mockFetch.mockResolvedValueOnce(ok(updated));

      const { result } = renderHook(() => useUpdateTask(), { wrapper });

      result.current.mutate({ id: 't-1', patch: { title: 'Renamed' } as never });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tasks/t-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ title: 'Renamed' }),
        })
      );
      // Optimistic patch applied to cached list + detail
      const cachedList = client.getQueryData<TaskRow[]>(listKey)!;
      expect(cachedList[0].title).toBe('Renamed');
      const cachedDetail = client.getQueryData<TaskRow>(taskKeys.detail('t-1'))!;
      expect(cachedDetail.title).toBe('Renamed');
    });

    it('rolls the cache back to the previous state on error (onError)', async () => {
      const client = makeClient();
      const wrapper = wrapperFor(client);

      const listKey = taskKeys.list();
      const original = makeTask({ id: 't-1', title: 'Old' });
      client.setQueryData(listKey, [original]);
      client.setQueryData(taskKeys.detail('t-1'), original);

      mockFetch.mockResolvedValueOnce(err('update failed'));

      const { result } = renderHook(() => useUpdateTask(), { wrapper });

      result.current.mutate({ id: 't-1', patch: { title: 'Renamed' } as never });

      await waitFor(() => expect(result.current.isError).toBe(true));
      // Rolled back to original title in both list and detail
      const cachedList = client.getQueryData<TaskRow[]>(listKey)!;
      expect(cachedList[0].title).toBe('Old');
      const cachedDetail = client.getQueryData<TaskRow>(taskKeys.detail('t-1'))!;
      expect(cachedDetail.title).toBe('Old');
    });

    it('works when there is no cached list or detail (skip branches)', async () => {
      const updated = makeTask({ id: 't-9', title: 'X' });
      mockFetch.mockResolvedValueOnce(ok(updated));

      const { result } = renderHook(() => useUpdateTask(), { wrapper: createWrapper() });

      result.current.mutate({ id: 't-9', patch: { title: 'X' } as never });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  // ─── useDeleteTask ─────────────────────────────────────────────────────
  describe('useDeleteTask', () => {
    it('DELETEs a task', async () => {
      mockFetch.mockResolvedValueOnce(ok(null));

      const { result } = renderHook(() => useDeleteTask(), { wrapper: createWrapper() });

      result.current.mutate('t-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tasks/t-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // ─── useTaskCategories ─────────────────────────────────────────────────
  describe('useTaskCategories', () => {
    it('fetches categories', async () => {
      const cats = [makeCategory()];
      mockFetch.mockResolvedValueOnce(ok(cats));

      const { result } = renderHook(() => useTaskCategories(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(cats);
      expect(mockFetch).toHaveBeenCalledWith('/api/task-categories', expect.any(Object));
    });
  });

  // ─── useCreateTaskCategory ─────────────────────────────────────────────
  describe('useCreateTaskCategory', () => {
    it('POSTs a new category', async () => {
      const created = makeCategory({ id: 'c-new', name: 'Work' });
      mockFetch.mockResolvedValueOnce(ok(created));

      const { result } = renderHook(() => useCreateTaskCategory(), { wrapper: createWrapper() });

      result.current.mutate({ name: 'Work', color: '#123', icon: null });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(created);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/task-categories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Work', color: '#123', icon: null }),
        })
      );
    });
  });

  // ─── useUpdateTaskCategory (optimistic) ────────────────────────────────
  describe('useUpdateTaskCategory', () => {
    it('PATCHes a category and patches the cache optimistically', async () => {
      const client = makeClient();
      const wrapper = wrapperFor(client);

      const catsKey = taskKeys.categories();
      client.setQueryData(catsKey, [makeCategory({ id: 'c-1', name: 'Home' })]);

      const updated = makeCategory({ id: 'c-1', name: 'House' });
      mockFetch.mockResolvedValueOnce(ok(updated));

      const { result } = renderHook(() => useUpdateTaskCategory(), { wrapper });

      result.current.mutate({ id: 'c-1', patch: { name: 'House' } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/task-categories/c-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'House' }),
        })
      );
      const cached = client.getQueryData<TaskCategoryRow[]>(catsKey)!;
      expect(cached[0].name).toBe('House');
    });

    it('rolls back the categories cache on error', async () => {
      const client = makeClient();
      const wrapper = wrapperFor(client);

      const catsKey = taskKeys.categories();
      client.setQueryData(catsKey, [makeCategory({ id: 'c-1', name: 'Home' })]);

      mockFetch.mockResolvedValueOnce(err('rename failed'));

      const { result } = renderHook(() => useUpdateTaskCategory(), { wrapper });

      result.current.mutate({ id: 'c-1', patch: { name: 'House' } });

      await waitFor(() => expect(result.current.isError).toBe(true));
      const cached = client.getQueryData<TaskCategoryRow[]>(catsKey)!;
      expect(cached[0].name).toBe('Home');
    });

    it('succeeds with no cached categories (skip branch)', async () => {
      mockFetch.mockResolvedValueOnce(ok(makeCategory({ id: 'c-2', name: 'Y' })));

      const { result } = renderHook(() => useUpdateTaskCategory(), { wrapper: createWrapper() });

      result.current.mutate({ id: 'c-2', patch: { name: 'Y' } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  // ─── useDeleteTaskCategory ─────────────────────────────────────────────
  describe('useDeleteTaskCategory', () => {
    it('DELETEs a category', async () => {
      mockFetch.mockResolvedValueOnce(ok(null));

      const { result } = renderHook(() => useDeleteTaskCategory(), { wrapper: createWrapper() });

      result.current.mutate('c-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/task-categories/c-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  // ─── useReorderTaskCategories (optimistic) ─────────────────────────────
  describe('useReorderTaskCategories', () => {
    it('POSTs reordered categories and reorders the cache optimistically', async () => {
      const client = makeClient();
      const wrapper = wrapperFor(client);

      const catsKey = taskKeys.categories();
      client.setQueryData(catsKey, [
        makeCategory({ id: 'c-1', name: 'A', sortOrder: 0 }),
        makeCategory({ id: 'c-2', name: 'B', sortOrder: 1 }),
      ]);

      mockFetch.mockResolvedValueOnce(ok({ updated: 2 }));

      const { result } = renderHook(() => useReorderTaskCategories(), { wrapper });

      result.current.mutate(['c-2', 'c-1']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/task-categories/reorder',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            categories: [
              { id: 'c-2', sortOrder: 0 },
              { id: 'c-1', sortOrder: 1 },
            ],
          }),
        })
      );
      const cached = client.getQueryData<TaskCategoryRow[]>(catsKey)!;
      expect(cached.map((c) => c.id)).toEqual(['c-2', 'c-1']);
      expect(cached[0].sortOrder).toBe(0);
      expect(cached[1].sortOrder).toBe(1);
    });

    it('drops unknown ids from the optimistic order (filter branch)', async () => {
      const client = makeClient();
      const wrapper = wrapperFor(client);

      const catsKey = taskKeys.categories();
      client.setQueryData(catsKey, [makeCategory({ id: 'c-1', name: 'A' })]);

      mockFetch.mockResolvedValueOnce(ok({ updated: 1 }));

      const { result } = renderHook(() => useReorderTaskCategories(), { wrapper });

      result.current.mutate(['missing', 'c-1']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const cached = client.getQueryData<TaskCategoryRow[]>(catsKey)!;
      expect(cached.map((c) => c.id)).toEqual(['c-1']);
    });

    it('rolls back the cache order on error', async () => {
      const client = makeClient();
      const wrapper = wrapperFor(client);

      const catsKey = taskKeys.categories();
      client.setQueryData(catsKey, [
        makeCategory({ id: 'c-1', name: 'A', sortOrder: 0 }),
        makeCategory({ id: 'c-2', name: 'B', sortOrder: 1 }),
      ]);

      mockFetch.mockResolvedValueOnce(err('reorder failed'));

      const { result } = renderHook(() => useReorderTaskCategories(), { wrapper });

      result.current.mutate(['c-2', 'c-1']);

      await waitFor(() => expect(result.current.isError).toBe(true));
      const cached = client.getQueryData<TaskCategoryRow[]>(catsKey)!;
      expect(cached.map((c) => c.id)).toEqual(['c-1', 'c-2']);
    });

    it('succeeds with no cached categories (skip branch)', async () => {
      mockFetch.mockResolvedValueOnce(ok({ updated: 0 }));

      const { result } = renderHook(() => useReorderTaskCategories(), { wrapper: createWrapper() });

      result.current.mutate(['c-1']);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  // ─── useTaskTags ───────────────────────────────────────────────────────
  describe('useTaskTags', () => {
    it('fetches tags', async () => {
      const tags = [{ id: 'tag-1', name: 'urgent', color: null, householdId: 'h-1' }];
      mockFetch.mockResolvedValueOnce(ok(tags));

      const { result } = renderHook(() => useTaskTags(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(tags);
      expect(mockFetch).toHaveBeenCalledWith('/api/task-tags', expect.any(Object));
    });
  });

  // ─── useCreateTaskTag ──────────────────────────────────────────────────
  describe('useCreateTaskTag', () => {
    it('POSTs a new tag', async () => {
      const created = { id: 'tag-new', name: 'later', color: '#0f0', householdId: 'h-1' };
      mockFetch.mockResolvedValueOnce(ok(created));

      const { result } = renderHook(() => useCreateTaskTag(), { wrapper: createWrapper() });

      result.current.mutate({ name: 'later', color: '#0f0' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(created);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/task-tags',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'later', color: '#0f0' }),
        })
      );
    });
  });

  // ─── useDeleteTaskTag ──────────────────────────────────────────────────
  describe('useDeleteTaskTag', () => {
    it('DELETEs a tag', async () => {
      mockFetch.mockResolvedValueOnce(ok(null));

      const { result } = renderHook(() => useDeleteTaskTag(), { wrapper: createWrapper() });

      result.current.mutate('tag-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/task-tags/tag-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
