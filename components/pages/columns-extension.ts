import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ColumnBlockView } from './columns-node-view';

/**
 * A two-column layout for the page editor. `columnBlock` is a container
 * with exactly two `column` children; each column holds normal block
 * content. The container carries a `leftRatio` attribute (0.15 – 0.85)
 * that drives the flex-basis of the two columns via the `--left-ratio`
 * CSS custom property. A ReactNodeView adds a draggable divider between
 * the columns; dragging updates `leftRatio` at drop time so undo/redo
 * capture one step per resize instead of a stream of intermediate
 * values.
 *
 * Rendered as flex divs (see globals.css `.page-columns` / `.page-column`),
 * so columns sit side by side on wide screens and stack on mobile.
 * `setColumns` inserts an empty two-column block at 50/50.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columnBlock: {
      /** Insert an empty two-column layout at the selection. */
      setColumns: () => ReturnType;
    };
  }
}

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  // `isolating: true` was blocking cross-column drag-and-drop — ProseMirror
  // treats isolating nodes as boundaries that slices can't cross, so
  // dragging a paragraph from one column into the other silently failed.
  // The column now behaves like a plain block container.
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'page-column' }),
      0,
    ];
  },
});

/** Clamp so a column never shrinks below a usable minimum. */
export const MIN_LEFT_RATIO = 0.15;
export const MAX_LEFT_RATIO = 0.85;
export const DEFAULT_LEFT_RATIO = 0.5;

export const ColumnBlock = Node.create({
  name: 'columnBlock',
  group: 'block',
  content: 'column column',
  defining: true,

  addAttributes() {
    return {
      leftRatio: {
        default: DEFAULT_LEFT_RATIO,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-left-ratio');
          const parsed = raw == null ? DEFAULT_LEFT_RATIO : Number(raw);
          if (!Number.isFinite(parsed)) return DEFAULT_LEFT_RATIO;
          return Math.min(MAX_LEFT_RATIO, Math.max(MIN_LEFT_RATIO, parsed));
        },
        renderHTML: (attrs) => {
          const r = Number(attrs.leftRatio);
          const ratio = Number.isFinite(r) ? r : DEFAULT_LEFT_RATIO;
          return {
            'data-left-ratio': String(ratio),
            style: `--left-ratio: ${ratio}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'column-block', class: 'page-columns' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnBlockView);
  },

  addCommands() {
    return {
      setColumns:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { leftRatio: DEFAULT_LEFT_RATIO },
              content: [
                { type: 'column', content: [{ type: 'paragraph' }] },
                { type: 'column', content: [{ type: 'paragraph' }] },
              ],
            })
            .run(),
    };
  },
});
