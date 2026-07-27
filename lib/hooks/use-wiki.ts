'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface WikiConceptListRow {
  id: string;
  path: string;
  type: string;
  title: string;
  description: string | null;
  projectId: string | null;
  sourceUrl: string | null;
  generatedAt: string | null;
  updatedAt: string;
}

export interface WikiConceptDetail extends WikiConceptListRow {
  body: string;
  frontmatter: Record<string, unknown>;
  sourceRaw: string | null;
  project: { id: string; title: string; path: string } | null;
  questions: {
    id: string;
    orderIndex: number;
    question: string;
    options: string[];
    correctIdx: number;
    explanation: string;
  }[];
}

const wikiKeys = {
  all: ['wiki'] as const,
  list: () => [...wikiKeys.all, 'list'] as const,
  detail: (id: string) => [...wikiKeys.all, 'detail', id] as const,
};

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

export function useWikiConcepts() {
  return useQuery({
    queryKey: wikiKeys.list(),
    queryFn: () => fetchJson<WikiConceptListRow[]>('/api/wiki/concepts'),
  });
}

export function useWikiConcept(id: string | null) {
  return useQuery({
    queryKey: id ? wikiKeys.detail(id) : ['wiki', 'detail', 'noop'],
    queryFn: () => fetchJson<WikiConceptDetail>(`/api/wiki/concepts/${id}`),
    enabled: !!id,
  });
}

export function useIngestSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      url?: string;
      rawText?: string;
      projectId?: string | null;
      promptOverride?: string;
    }) =>
      fetchJson<{ id: string; path: string }>('/api/wiki/sources', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: wikiKeys.list() }),
  });
}

export function useReSummarize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; promptOverride?: string }) =>
      fetchJson<{ id: string }>(`/api/wiki/concepts/${input.id}/re-summarize`, {
        method: 'POST',
        body: JSON.stringify({ promptOverride: input.promptOverride }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: wikiKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: wikiKeys.list() });
    },
  });
}

export function useDeleteWikiConcept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson<void>(`/api/wiki/concepts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: wikiKeys.all }),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; description?: string; body?: string; tags?: string[] }) =>
      fetchJson<WikiConceptListRow>('/api/wiki/concepts', {
        method: 'POST',
        body: JSON.stringify({ type: 'Project', ...input, body: input.body ?? '' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: wikiKeys.list() }),
  });
}

export function useSubmitAttempt() {
  return useMutation({
    mutationFn: (input: { questionId: string; selectedIdx: number }) =>
      fetchJson<{ correct: boolean; correctIdx: number }>(
        `/api/wiki/questions/${input.questionId}/attempt`,
        {
          method: 'POST',
          body: JSON.stringify({ selectedIdx: input.selectedIdx }),
        }
      ),
  });
}

// ─── Settings ──────────────────────────────────────────────────────────

export interface WikiPromptResponse {
  prompt: string | null;
  defaultPrompt: string;
}

export function useWikiPrompt() {
  return useQuery({
    queryKey: ['settings', 'wiki-prompt'],
    queryFn: () => fetchJson<WikiPromptResponse>('/api/settings/wiki-prompt'),
  });
}

export function useUpdateWikiPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prompt: string | null) =>
      fetchJson<{ prompt: string | null }>('/api/settings/wiki-prompt', {
        method: 'PUT',
        body: JSON.stringify({ prompt }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'wiki-prompt'] }),
  });
}
