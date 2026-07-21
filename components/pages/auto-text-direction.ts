import { Extension } from '@tiptap/core';

/**
 * Auto text direction per block. Adds `dir="auto"` to each text block so the
 * browser picks LTR/RTL from the block's own content (first strong character) —
 * Hebrew paragraphs render right-to-left and right-aligned, English ones
 * left-to-right, and mixed documents work line by line with no manual toggle.
 * `dir` (vs. CSS `unicode-bidi`) sets the element's real directionality, so
 * `text-align: start` and the logical-property list/quote styles flip too.
 *
 * `bulletList`/`orderedList` are included so the `<ul>`/`<ol>` container flips
 * and its inline-start padding indents from the right for RTL lists.
 */
export const DIR_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'bulletList',
  'orderedList',
  'codeBlock',
] as const;

export const AutoTextDirection = Extension.create({
  name: 'autoTextDirection',
  addGlobalAttributes() {
    return [
      {
        types: [...DIR_BLOCK_TYPES],
        attributes: {
          dir: {
            default: 'auto',
            parseHTML: (el) => el.getAttribute('dir') || 'auto',
            renderHTML: (attrs) => (attrs.dir ? { dir: attrs.dir } : {}),
          },
        },
      },
    ];
  },
});
