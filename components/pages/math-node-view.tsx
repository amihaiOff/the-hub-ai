'use client';

import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
// KaTeX styles load with the (lazily-imported) editor, not on every page.
import 'katex/dist/katex.min.css';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { cn } from '@/lib/utils';

/**
 * Notion-style math nodes for the page editor. Two flavours:
 *
 *   - `MathInlineView`  → inline atom; TeX typed inside `\( … \)`.
 *   - `MathBlockView`   → block atom; TeX typed inside `\[ … \]` on its
 *                         own line.
 *
 * Both share the same UX: when the node is selected (click or keyboard
 * NodeSelection) we swap to an editable raw-TeX input; otherwise we show
 * the KaTeX-rendered HTML. `tex` is stored as a plain string attribute so
 * Tiptap JSON serialisation is automatic and round-trips cleanly through
 * the DB.
 */

interface RenderedProps {
  tex: string;
  displayMode: boolean;
}

function RenderedMath({ tex, displayMode }: RenderedProps) {
  const html =
    tex.trim().length === 0
      ? ''
      : katex.renderToString(tex, {
          throwOnError: false,
          displayMode,
          output: 'html',
        });
  if (!tex.trim()) {
    return (
      <span className="text-muted-foreground/70 border-border/50 rounded-md border border-dashed px-1.5 py-0.5 font-mono text-xs">
        [ math ]
      </span>
    );
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Deselect a NodeSelection cleanly (moves the caret just after the node). */
function deselectNode(props: NodeViewProps) {
  const { editor, getPos } = props;
  const pos = typeof getPos === 'function' ? getPos() : null;
  if (pos == null) return;
  editor
    .chain()
    .focus()
    .setTextSelection(pos + props.node.nodeSize)
    .run();
}

/**
 * Notion-style math node views use a LOCAL `editing` flag rather than
 * `props.selected` as the source of truth for whether to show the raw
 * TeX input.
 *
 * Why: writing to `node.attrs.tex` on every keystroke would replace the
 * node in the ProseMirror doc, which clears the NodeSelection (and thus
 * `props.selected`), which unmounts the input mid-typing. Instead we
 * keep the TeX in local state (`draft`) and only commit it to the node
 * on blur / Escape — one attribute-update per edit, no focus churn.
 *
 * New nodes (empty `tex`) mount in edit mode; the input auto-focuses.
 * Clicking a rendered node flips `editing` back to `true`.
 */

export function MathInlineView(props: NodeViewProps) {
  const tex = (props.node.attrs.tex as string) ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(tex.length === 0 || props.selected);
  const [draft, setDraft] = useState(tex);

  // Pull in an external `tex` change (undo/redo, remote update) only when
  // we're not actively editing — never clobber the user's typing. Deferred
  // via queueMicrotask so the effect doesn't fire a synchronous setState
  // (which the lint rule flags as cascading-render-prone).
  useEffect(() => {
    if (editing) return;
    queueMicrotask(() => setDraft(tex));
  }, [tex, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    if (draft !== tex) props.updateAttributes({ tex: draft });
    setEditing(false);
    // Move the caret past the node so the user can keep typing.
    deselectNode(props);
  };

  if (editing) {
    return (
      <NodeViewWrapper as="span" className="math-inline inline-block align-middle">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="e^{i\pi} + 1 = 0"
          className="bg-muted/50 text-foreground rounded-md px-2 py-0.5 font-mono text-sm outline-none"
          style={{ width: `${Math.max(6, draft.length + 2)}ch` }}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className="math-inline hover:bg-muted/40 inline-block cursor-pointer rounded-md px-0.5 align-middle transition-colors"
      onClick={() => setEditing(true)}
    >
      <RenderedMath tex={tex} displayMode={false} />
    </NodeViewWrapper>
  );
}

export function MathBlockView(props: NodeViewProps) {
  const tex = (props.node.attrs.tex as string) ?? '';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(tex.length === 0 || props.selected);
  const [draft, setDraft] = useState(tex);

  useEffect(() => {
    if (editing) return;
    queueMicrotask(() => setDraft(tex));
  }, [tex, editing]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const commit = () => {
    if (draft !== tex) props.updateAttributes({ tex: draft });
    setEditing(false);
    deselectNode(props);
  };

  if (editing) {
    return (
      <NodeViewWrapper className="math-block my-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              commit();
            }
            // Ctrl/Cmd+Enter finishes editing; plain Enter inserts a newline.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          spellCheck={false}
          rows={Math.max(2, draft.split('\n').length)}
          placeholder="\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}"
          className="bg-muted/50 text-foreground w-full resize-y rounded-md px-3 py-2 font-mono text-sm outline-none"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={cn(
        'math-block hover:bg-muted/40 my-2 cursor-pointer rounded-md py-2 text-center transition-colors'
      )}
      onClick={() => setEditing(true)}
    >
      <RenderedMath tex={tex} displayMode={true} />
    </NodeViewWrapper>
  );
}
