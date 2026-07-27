'use client';

import { useMemo } from 'react';
import { marked } from 'marked';

/**
 * Read-only markdown renderer for wiki bodies. Trust boundary: the source
 * of this HTML is our own LLM output stored in `wiki_concepts.body`, not
 * user-controlled markup — the summarizer forces structured tool output
 * and we've never included the raw source text in `body`. Still, marked
 * escapes HTML entities and disallows raw HTML by default (we never call
 * `.setOptions({ sanitize: false })`), so the injection surface is
 * whatever the LLM emits inside its markdown, which is text.
 */
export function WikiMarkdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => marked.parse(source, { async: false }) as string, [source]);
  return (
    <div className={`wiki-prose ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
