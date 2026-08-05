'use client';

import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
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

export function MathInlineView(props: NodeViewProps) {
  const tex = (props.node.attrs.tex as string) ?? '';
  const selected = props.selected;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(tex);

  // Sync draft when the underlying attribute changes from outside (undo, etc).
  useEffect(() => {
    setDraft(tex);
  }, [tex]);

  // When the node becomes selected, focus the input so the user can start
  // typing raw TeX immediately (Notion-style).
  useEffect(() => {
    if (selected) inputRef.current?.focus();
  }, [selected]);

  if (selected) {
    return (
      <NodeViewWrapper as="span" className="math-inline inline-block align-middle">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            props.updateAttributes({ tex: e.target.value });
          }}
          onBlur={() => deselectNode(props)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              e.preventDefault();
              deselectNode(props);
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
      onClick={() => {
        // Select the node so the view swaps to edit mode.
        const { editor, getPos } = props;
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const { state, view } = editor;
        const tr = state.tr.setSelection(NodeSelection.create(state.doc, pos));
        view.dispatch(tr);
      }}
    >
      <RenderedMath tex={tex} displayMode={false} />
    </NodeViewWrapper>
  );
}

export function MathBlockView(props: NodeViewProps) {
  const tex = (props.node.attrs.tex as string) ?? '';
  const selected = props.selected;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(tex);

  useEffect(() => {
    setDraft(tex);
  }, [tex]);

  useEffect(() => {
    if (selected) textareaRef.current?.focus();
  }, [selected]);

  if (selected) {
    return (
      <NodeViewWrapper className="math-block my-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            props.updateAttributes({ tex: e.target.value });
          }}
          onBlur={() => deselectNode(props)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              deselectNode(props);
            }
            // Ctrl/Cmd+Enter finishes editing; plain Enter inserts a newline.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              deselectNode(props);
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
      onClick={() => {
        const { editor, getPos } = props;
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const { state, view } = editor;
        const tr = state.tr.setSelection(NodeSelection.create(state.doc, pos));
        view.dispatch(tr);
      }}
    >
      <RenderedMath tex={tex} displayMode={true} />
    </NodeViewWrapper>
  );
}
