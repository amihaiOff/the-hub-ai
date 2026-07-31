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
  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false }) as string;
    // Give each block element `dir="auto"` so it picks its own direction from
    // its first strong character — Hebrew blocks render right-to-left and
    // right-aligned, English stays left-to-right, mixed docs work line by line
    // (mirrors the Areas editor). marked emits attribute-less block tags, so a
    // simple tag rewrite is safe; the paired CSS in `.wiki-prose` uses
    // `text-align: start` and logical (inline) gutters.
    return raw.replace(/<(h[1-6]|p|li|blockquote|td|th)>/g, '<$1 dir="auto">');
  }, [source]);
  return (
    <div className={`wiki-prose ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
