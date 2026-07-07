'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilters,
  TaskStatus,
  TaskPriority,
} from '@/lib/validations/tasks';

// ─── Types the UI consumes ──────────────────────────────────────────────

export interface TaskCategoryRow {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  householdId: string;
}

export interface TaskTagRow {
  id: string;
  name: string;
  color: string | null;
  householdId: string;
}

export interface TaskShareRow {
  id: string;
  userId: string;
  canEdit: boolean;
}

export interface TaskAssignee {
  id: string;
  name: string;
  color: string | null;
  image: string | null;
}

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  sortOrder: number;
  customFields: unknown;
  categoryId: string | null;
  ownerId: string;
  assigneeId: string | null;
  parentTaskId: string | null;
  householdId: string;
  createdAt: string;
  updatedAt: string;
  category: TaskCategoryRow | null;
  assignee: TaskAssignee | null;
  tags: TaskTagRow[];
  shares: TaskShareRow[];
  children?: TaskRow[];
}

// ─── Query keys ─────────────────────────────────────────────────────────

export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters?: TaskFilters) => [...taskKeys.lists(), filters ?? {}] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  categories: () => ['task-categories'] as const,
  tags: () => ['task-tags'] as const,
};

// ─── Small fetch helper ─────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

function toQuery(filters?: TaskFilters): string {
  if (!filters) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ─── Task queries ───────────────────────────────────────────────────────

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => fetchJson<TaskRow[]>(`/api/tasks${toQuery(filters)}`),
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: id ? taskKeys.detail(id) : ['tasks', 'detail', 'noop'],
    queryFn: () => fetchJson<TaskRow>(`/api/tasks/${id}`),
    enabled: !!id,
  });
}

// ─── Task mutations ─────────────────────────────────────────────────────

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      fetchJson<TaskRow>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      fetchJson<TaskRow>(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    // Optimistic list + detail patch — the caller's inline edit shows up
    // instantly; a failure rolls the cache back to the pre-mutation state.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const previous = qc.getQueriesData<TaskRow[]>({ queryKey: taskKeys.lists() });
      // Patch every cached list
      for (const [key, tasks] of previous) {
        if (!tasks) continue;
        qc.setQueryData<TaskRow[]>(
          key,
          tasks.map((t) =>
            t.id === id ? ({ ...t, ...patch, updatedAt: t.updatedAt } as TaskRow) : t
          )
        );
      }
      // Patch the detail if we have one
      const prevDetail = qc.getQueryData<TaskRow>(taskKeys.detail(id));
      if (prevDetail) {
        qc.setQueryData<TaskRow>(taskKeys.detail(id), { ...prevDetail, ...patch } as TaskRow);
      }
      return { previous, prevDetail };
    },
    onError: (_err, { id }, ctx) => {
      if (!ctx) return;
      for (const [key, tasks] of ctx.previous) qc.setQueryData(key, tasks);
      if (ctx.prevDetail) qc.setQueryData(taskKeys.detail(id), ctx.prevDetail);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: taskKeys.detail(id) });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

// ─── Categories ─────────────────────────────────────────────────────────

export function useTaskCategories() {
  return useQuery({
    queryKey: taskKeys.categories(),
    queryFn: () => fetchJson<TaskCategoryRow[]>('/api/task-categories'),
  });
}

export function useCreateTaskCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string | null }) =>
      fetchJson<TaskCategoryRow>('/api/task-categories', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.categories() }),
  });
}

export function useUpdateTaskCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TaskCategoryRow> }) =>
      fetchJson<TaskCategoryRow>(`/api/task-categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.categories() }),
  });
}

export function useDeleteTaskCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/task-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.categories() });
      // Task rows may have been un-categorized by the SET NULL FK.
      qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}

const REORDER_CATEGORIES_KEY = ['reorder-task-categories'];

export function useReorderTaskCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: REORDER_CATEGORIES_KEY,
    // `ordered` is the full list of category ids in their new order.
    mutationFn: (ordered: string[]) =>
      fetchJson<{ updated: number }>('/api/task-categories/reorder', {
        method: 'POST',
        body: JSON.stringify({
          categories: ordered.map((id, index) => ({ id, sortOrder: index })),
        }),
      }),
    // Optimistically reorder the cached categories so the dialog and the main
    // screen reflect the new order immediately.
    onMutate: async (ordered) => {
      await qc.cancelQueries({ queryKey: taskKeys.categories() });
      const previous = qc.getQueryData<TaskCategoryRow[]>(taskKeys.categories());
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        const next = ordered
          .map((id, index) => {
            const cat = byId.get(id);
            return cat ? { ...cat, sortOrder: index } : null;
          })
          .filter((c): c is TaskCategoryRow => c !== null);
        qc.setQueryData(taskKeys.categories(), next);
      }
      return { previous };
    },
    onError: (_err, _ordered, ctx) => {
      if (ctx?.previous) qc.setQueryData(taskKeys.categories(), ctx.previous);
    },
    onSettled: () => {
      // Only the last outstanding reorder refetches, so a slower earlier
      // request can't snap the list back over a newer optimistic order.
      if (qc.isMutating({ mutationKey: REORDER_CATEGORIES_KEY }) <= 1) {
        qc.invalidateQueries({ queryKey: taskKeys.categories() });
      }
    },
  });
}

// ─── Tags ───────────────────────────────────────────────────────────────

export function useTaskTags() {
  return useQuery({
    queryKey: taskKeys.tags(),
    queryFn: () => fetchJson<TaskTagRow[]>('/api/task-tags'),
  });
}

export function useCreateTaskTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string | null }) =>
      fetchJson<TaskTagRow>('/api/task-tags', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.tags() }),
  });
}

export function useDeleteTaskTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/task-tags/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.tags() });
      qc.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
