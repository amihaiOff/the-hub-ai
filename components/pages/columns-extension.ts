import { Node, mergeAttributes } from '@tiptap/core';

/**
 * A minimal two-column layout for the page editor, modelled as a `columnBlock`
 * container holding exactly two `column` nodes, each of which holds normal
 * block content. Rendered as flex divs (see globals.css `.page-columns` /
 * `.page-column`), so columns sit side by side on wide screens and stack on
 * mobile. `setColumns` inserts an empty two-column block.
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
  isolating: true,
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

export const ColumnBlock = Node.create({
  name: 'columnBlock',
  group: 'block',
  content: 'column column',
  defining: true,

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

  addCommands() {
    return {
      setColumns:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              content: [
                { type: 'column', content: [{ type: 'paragraph' }] },
                { type: 'column', content: [{ type: 'paragraph' }] },
              ],
            })
            .run(),
    };
  },
});
