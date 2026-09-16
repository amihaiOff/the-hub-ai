'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, type PageTabRow } from '@/lib/hooks/use-pages';
import type { UpdatePageTabInput } from '@/lib/validations/pages';

/** The public, no-session shape returned by GET /api/share/[token] — a strict
 * subset of PageRow: no id beyond the page's own, no owner/household fields. */
export interface SharedPageRow {
  id: string;
  title: string;
  emoji: string | null;
  autoCapitalize: boolean;
  shareAccess: 'view' | 'edit';
  tabs: PageTabRow[];
}

const sharedPageKey = (token: string) => ['shared-page', token] as const;

export function useSharedPage(token: string) {
  return useQuery({
    queryKey: sharedPageKey(token),
    queryFn: () => fetchJson<SharedPageRow>(`/api/share/${token}`),
    enabled: !!token,
    retry: false, // a 404 (bad/disabled token) won't fix itself on retry
  });
}

/** Only meaningful when the page's shareAccess is 'edit' — the server 403s otherwise. */
export function useUpdateSharedPageTab(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tabId, patch }: { tabId: string; patch: UpdatePageTabInput }) =>
      fetchJson<PageTabRow>(`/api/share/${token}/tabs/${tabId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ tabId, patch }) => {
      await qc.cancelQueries({ queryKey: sharedPageKey(token) });
      const prev = qc.getQueryData<SharedPageRow>(sharedPageKey(token));
      if (prev) {
        qc.setQueryData<SharedPageRow>(sharedPageKey(token), {
          ...prev,
          tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
        });
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(sharedPageKey(token), ctx.prev);
    },
  });
}
