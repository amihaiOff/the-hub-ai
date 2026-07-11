'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePageInput, UpdatePageInput } from '@/lib/validations/pages';

// ─── Types the UI consumes ──────────────────────────────────────────────

/** Row shape returned by the list endpoint (no content — kept light). */
export interface PageListRow {
  id: string;
  title: string;
  emoji: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Full page including its Tiptap JSON content, from the detail endpoint. */
export interface PageRow extends PageListRow {
  content: unknown;
  ownerId: string;
  householdId: string;
}

// ─── Query keys ─────────────────────────────────────────────────────────

export const pageKeys = {
  all: ['pages'] as const,
  lists: () => [...pageKeys.all, 'list'] as const,
  list: () => [...pageKeys.lists()] as const,
  details: () => [...pageKeys.all, 'detail'] as const,
  detail: (id: string) => [...pageKeys.details(), id] as const,
};

// ─── Fetch helper ───────────────────────────────────────────────────────

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

// ─── Queries ────────────────────────────────────────────────────────────

export function usePages() {
  return useQuery({
    queryKey: pageKeys.list(),
    queryFn: () => fetchJson<PageListRow[]>('/api/pages'),
  });
}

export function usePage(id: string | null) {
  return useQuery({
    queryKey: pageKeys.detail(id ?? ''),
    queryFn: () => fetchJson<PageRow>(`/api/pages/${id}`),
    enabled: !!id,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePageInput = {}) =>
      fetchJson<PageRow>('/api/pages', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pageKeys.lists() }),
  });
}

export function useUpdatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePageInput }) =>
      fetchJson<PageRow>(`/api/pages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    // Optimistically reflect title/emoji edits in the sidebar list + detail so
    // the header and nav update instantly while the save is in flight.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: pageKeys.lists() });
      await qc.cancelQueries({ queryKey: pageKeys.detail(id) });
      const prevList = qc.getQueryData<PageListRow[]>(pageKeys.list());
      if (prevList) {
        qc.setQueryData<PageListRow[]>(
          pageKeys.list(),
          prevList.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...(patch.title !== undefined ? { title: patch.title } : {}),
                  ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
                }
              : p
          )
        );
      }
      const prevDetail = qc.getQueryData<PageRow>(pageKeys.detail(id));
      if (prevDetail) qc.setQueryData<PageRow>(pageKeys.detail(id), { ...prevDetail, ...patch });
      return { prevList, prevDetail };
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prevList) qc.setQueryData(pageKeys.list(), ctx.prevList);
      if (ctx?.prevDetail) qc.setQueryData(pageKeys.detail(id), ctx.prevDetail);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: pageKeys.lists() }),
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<{ ok: true }>(`/api/pages/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: pageKeys.detail(id) });
      qc.invalidateQueries({ queryKey: pageKeys.lists() });
    },
  });
}

/** Uploads an image to Blob storage and returns its public URL. */
export async function uploadPageImage(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/pages/upload', { method: 'POST', body });
  const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error ?? 'Upload failed');
  }
  return json.data.url;
}
