'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy entry point for the page body editor. The Tiptap/ProseMirror stack is
 * ~560 KB+ of JS (the heaviest chunk in the app), so we defer it with
 * `next/dynamic` — the page shell paints immediately and the editor loads on
 * demand. `ssr: false` because the editor is client-only anyway.
 *
 * Keep this the ONLY module that statically imports `./page-body-editor` —
 * everything else must import from here so the editor stays deferred. (A
 * no-restricted-imports lint rule enforcing this is added in the perf-guardrails
 * phase; until then this is a convention.)
 */
export const PageBodyEditor = dynamic(
  () => import('./page-body-editor').then((m) => m.PageBodyEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[60vh] px-1 py-2" aria-busy="true">
        <div className="bg-muted/40 h-5 w-2/3 animate-pulse rounded" />
        <div className="bg-muted/30 mt-3 h-4 w-full animate-pulse rounded" />
        <div className="bg-muted/30 mt-2 h-4 w-5/6 animate-pulse rounded" />
      </div>
    ),
  }
);
