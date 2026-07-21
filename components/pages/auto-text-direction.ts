import { Extension } from '@tiptap/core';

/**
 * Auto text direction per block. Adds `dir="auto"` to the block types that
 * carry their own text so the browser picks LTR/RTL from the block's own
 * content (first strong character) — a Hebrew heading/quote/list item renders
 * right-to-left and right-aligned, an English one left-to-right, and mixed
 * documents work block by block with no manual toggle. `dir` (vs. CSS
 * `unicode-bidi`) sets the element's real directionality, so `text-align: start`
 * and the logical-property list/quote styles flip with it.
 *
 * Deliberately NOT applied to `paragraph` (nor to the `bulletList`/`orderedList`
 * containers). A `dir` attribute on a descendant makes an ancestor's `dir="auto"`
 * skip that descendant's text when detecting direction — so a `<li dir="auto">`
 * wrapping a `<p dir="auto">` can't see the paragraph's Hebrew and wrongly
 * defaults to LTR, putting the bullet on the wrong side. Leaving the inner
 * paragraph without `dir` lets the `<li>` detect direction correctly (marker on
 * the start side). Standalone paragraphs get their auto direction from the CSS
 * `unicode-bidi: plaintext` rule on `.page-body p` instead (see globals.css).
 */
export const DIR_BLOCK_TYPES = ['heading', 'blockquote', 'listItem', 'codeBlock'] as const;

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
