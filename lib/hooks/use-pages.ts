'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePageInput,
  UpdatePageInput,
  CreatePageTabInput,
  UpdatePageTabInput,
  CreatePageSectionInput,
  UpdatePageSectionInput,
} from '@/lib/validations/pages';

// ─── Types the UI consumes ──────────────────────────────────────────────

/** Row shape returned by the list endpoint (no content — kept light). */
export interface PageListRow {
  id: string;
  title: string;
  emoji: string | null;
  sortOrder: number;
  sectionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A page section — a grouping of pages within a household. */
export interface PageSectionRow {
  id: string;
  name: string;
  sortOrder: number;
}

/** One tab within a page — its own title + Tiptap JSON content. */
export interface PageTabRow {
  id: string;
  title: string;
  content: unknown;
  sortOrder: number;
}

/** Full page including its tabs (each with content), from the detail endpoint. */
export interface PageRow extends PageListRow {
  content: unknown; // legacy page-level content (unused; content lives on tabs)
  ownerId: string;
  householdId: string;
  autoCapitalize: boolean;
  sectionId: string | null;
  tabs: PageTabRow[];
}

// ─── Query keys ─────────────────────────────────────────────────────────

export const pageKeys = {
  all: ['pages'] as const,
  lists: () => [...pageKeys.all, 'list'] as const,
  list: () => [...pageKeys.lists()] as const,
  details: () => [...pageKeys.all, 'detail'] as const,
  detail: (id: string) => [...pageKeys.details(), id] as const,
  sections: () => ['page-sections'] as const,
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

// ─── Tab mutations ──────────────────────────────────────────────────────

/** Replace a page's tab list in the detail cache (keeps it sorted). */
function setTabs(
  qc: ReturnType<typeof useQueryClient>,
  pageId: string,
  update: (tabs: PageTabRow[]) => PageTabRow[]
) {
  const prev = qc.getQueryData<PageRow>(pageKeys.detail(pageId));
  if (!prev) return prev;
  const tabs = update(prev.tabs ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  qc.setQueryData<PageRow>(pageKeys.detail(pageId), { ...prev, tabs });
  return prev;
}

export function useCreatePageTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, input }: { pageId: string; input?: CreatePageTabInput }) =>
      fetchJson<PageTabRow>(`/api/pages/${pageId}/tabs`, {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: (tab, { pageId }) => setTabs(qc, pageId, (tabs) => [...tabs, tab]),
  });
}

export function useUpdatePageTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pageId,
      tabId,
      patch,
    }: {
      pageId: string;
      tabId: string;
      patch: UpdatePageTabInput;
    }) =>
      fetchJson<PageTabRow>(`/api/pages/${pageId}/tabs/${tabId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    // Optimistically patch the tab in the detail cache so the tab bar label and
    // ordering update instantly. Content isn't invalidated on settle (the live
    // editor owns it), matching useUpdatePage.
    onMutate: async ({ pageId, tabId, patch }) => {
      await qc.cancelQueries({ queryKey: pageKeys.detail(pageId) });
      const prev = setTabs(qc, pageId, (tabs) =>
        tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t))
      );
      return { prev };
    },
    onError: (_e, { pageId }, ctx) => {
      if (ctx?.prev) qc.setQueryData(pageKeys.detail(pageId), ctx.prev);
    },
  });
}

export function useDeletePageTab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, tabId }: { pageId: string; tabId: string }) =>
      fetchJson<{ ok: true }>(`/api/pages/${pageId}/tabs/${tabId}`, { method: 'DELETE' }),
    onSuccess: (_d, { pageId, tabId }) =>
      setTabs(qc, pageId, (tabs) => tabs.filter((t) => t.id !== tabId)),
  });
}

// ─── Sections ───────────────────────────────────────────────────────────

export function useSections() {
  return useQuery({
    queryKey: pageKeys.sections(),
    queryFn: () => fetchJson<PageSectionRow[]>('/api/pages/sections'),
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePageSectionInput) =>
      fetchJson<PageSectionRow>('/api/pages/sections', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pageKeys.sections() }),
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePageSectionInput }) =>
      fetchJson<PageSectionRow>(`/api/pages/sections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pageKeys.sections() }),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ ok: true }>(`/api/pages/sections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      // Deleting a section nulls pages.sectionId, so the pages list needs a refetch too.
      qc.invalidateQueries({ queryKey: pageKeys.sections() });
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
