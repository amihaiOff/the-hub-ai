import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MathInlineView, MathBlockView } from './math-node-view';

/**
 * Notion-style LaTeX (KaTeX) support for the page editor.
 *
 * Two nodes:
 *   - `mathInline`  — inline atom, triggered by typing `\( … \)`
 *   - `mathBlock`   — block atom,  triggered by typing `\[ … \]` on its own line
 *
 * Both persist the raw LaTeX in a single `tex` string attribute, so Tiptap
 * JSON serialisation (and therefore the DB round-trip + backup) is automatic.
 * Rendering happens in the React NodeViews via `katex.renderToString`.
 */

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      tex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-tex') ?? '',
        renderHTML: (attrs) => ({ 'data-tex': (attrs.tex as string) ?? '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },

  addInputRules() {
    // Fires when the user completes `\( … \)` — capture group 1 is the TeX
    // source. Non-greedy so `\( a \) \( b \)` on one line stays two nodes.
    return [
      nodeInputRule({
        find: /\\\(([^)]+?)\\\)$/,
        type: this.type,
        getAttributes: (match) => ({ tex: match[1] ?? '' }),
      }),
    ];
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      tex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-tex') ?? '',
        renderHTML: (attrs) => ({ 'data-tex': (attrs.tex as string) ?? '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addInputRules() {
    // Fires when the user completes `\[ … \]` alone on a line — Tiptap's
    // `nodeInputRule` replaces the matched range with a new block node.
    return [
      nodeInputRule({
        find: /^\\\[([^\]]+)\\\]$/,
        type: this.type,
        getAttributes: (match) => ({ tex: match[1] ?? '' }),
      }),
    ];
  },
});
