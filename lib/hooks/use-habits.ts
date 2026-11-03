'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateHabitInput, UpdateHabitInput } from '@/lib/validations/habits';
import type { HabitRow } from '@/lib/habits/serialize';
import type { HabitLogStatus } from '@/lib/habits/schedule';

export type { HabitRow };

export interface HabitLogRow {
  habitId: string;
  date: string;
  status: HabitLogStatus;
}

export const habitKeys = {
  all: ['habits'] as const,
  list: (archived: boolean) => [...habitKeys.all, 'list', archived] as const,
  logsAll: () => [...habitKeys.all, 'logs'] as const,
  logs: (from: string, to: string) => [...habitKeys.logsAll(), from, to] as const,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!res.ok || !json.success) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json.data as T;
}

export function useHabits(archived = false) {
  return useQuery({
    queryKey: habitKeys.list(archived),
    queryFn: () => fetchJson<HabitRow[]>(`/api/habits${archived ? '?archived=1' : ''}`),
  });
}

export function useHabitLogs(from: string, to: string) {
  return useQuery({
    queryKey: habitKeys.logs(from, to),
    queryFn: () => fetchJson<HabitLogRow[]>(`/api/habits/logs?from=${from}&to=${to}`),
  });
}

const invalidateLists = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: [...habitKeys.all, 'list'] });

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHabitInput) =>
      fetchJson<HabitRow>('/api/habits', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidateLists(qc),
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateHabitInput & { id: string }) =>
      fetchJson<HabitRow>(`/api/habits/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => invalidateLists(qc),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/habits/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateLists(qc);
      qc.invalidateQueries({ queryKey: habitKeys.logsAll() });
    },
  });
}

export function useReorderHabits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      fetchJson<void>('/api/habits/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: habitKeys.list(false) });
      const previous = qc.getQueryData<HabitRow[]>(habitKeys.list(false));
      if (previous) {
        const byId = new Map(previous.map((h) => [h.id, h]));
        qc.setQueryData(
          habitKeys.list(false),
          ids.map((id) => byId.get(id)).filter((h): h is HabitRow => !!h)
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(habitKeys.list(false), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: habitKeys.list(false) }),
  });
}

/** Mark a day Done / Not done, or clear it (`status: null`). Optimistic. */
export function useSetHabitLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      habitId,
      date,
      status,
    }: {
      habitId: string;
      date: string;
      status: HabitLogStatus | null;
    }) =>
      fetchJson<void>(`/api/habits/${habitId}/log`, {
        method: 'PUT',
        body: JSON.stringify({ date, status }),
      }),
    onMutate: async ({ habitId, date, status }) => {
      await qc.cancelQueries({ queryKey: habitKeys.logsAll() });
      const previous = qc.getQueriesData<HabitLogRow[]>({ queryKey: habitKeys.logsAll() });
      for (const [key, rows] of previous) {
        if (!rows) continue;
        const [, , from, to] = key as [string, string, string, string];
        if (date < from || date > to) continue;
        const rest = rows.filter((r) => !(r.habitId === habitId && r.date === date));
        qc.setQueryData(key, status ? [...rest, { habitId, date, status }] : rest);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, rows] of ctx?.previous ?? []) qc.setQueryData(key, rows);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: habitKeys.logsAll() }),
  });
}
