import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Auto text direction for the page editor.
 *
 * Two mechanisms:
 *
 * 1. `dir="auto"` as a global attribute on the text-carrying leaf blocks that
 *    stand alone — `heading`, `blockquote`, `codeBlock` — so a Hebrew heading
 *    renders right-to-left / right-aligned and an English one the opposite,
 *    per block, with no manual toggle.
 *
 * 2. For LISTS, direction is set on the **top-level list container only** and
 *    inherited by every nested list and item (via a view decoration, not a model
 *    attribute — see the plugin below). This makes a whole nested branch form a
 *    single coherent indentation staircase on one side. The earlier approach put
 *    `dir="auto"` on each `<li>`, so a nested item resolved direction from its
 *    OWN text — a Hebrew child of an English parent flipped to the opposite side
 *    of the page (the "list indenting is a mess" bug). Individual lines still
 *    render their own language: `.page-body li > p { unicode-bidi: isolate }`
 *    keeps each line a self-contained bidi run while hugging the marker.
 *
 * Deliberately NOT applied to `paragraph`, `listItem`, or the list containers as
 * model attributes: an element with `dir="auto"` ignores the text of any
 * descendant that itself carries a `dir` attribute when detecting direction, so
 * for a top-level `<ul dir="auto">` to see its first item's text, no descendant
 * may carry `dir`. Standalone paragraphs get their direction from the
 * `unicode-bidi: plaintext` rule on `.page-body p` (see globals.css).
 */
export const DIR_BLOCK_TYPES = ['heading', 'blockquote', 'codeBlock'] as const;

/** List container node names whose top-level instances get `dir="auto"`. */
const LIST_CONTAINER_NAMES = ['bulletList', 'orderedList', 'taskList'];

const autoDirListKey = new PluginKey<DecorationSet>('autoDirTopLevelList');

/**
 * `dir="auto"` decorations for the top-level lists in `doc`. A list whose parent
 * isn't a list item is top-level; its nested lists/items inherit the direction,
 * so we decorate it and skip its subtree (`return false`).
 */
function buildListDirDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (
      LIST_CONTAINER_NAMES.includes(node.type.name) &&
      parent?.type.name !== 'listItem' &&
      parent?.type.name !== 'taskItem'
    ) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: 'auto' }));
      return false; // nested lists inherit — no need to walk into this list
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

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
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: autoDirListKey,
        // `dir="auto"` on the top-level list only (nested lists inherit it), so
        // the whole branch shares one indentation direction. Kept as a
        // decoration rather than a model attribute so it never persists into the
        // saved JSON / markdown and can't starve auto-detection. Cached in plugin
        // state and only rebuilt when the doc changes — cursor moves reuse it.
        state: {
          init: (_config, state) => buildListDirDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildListDirDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return autoDirListKey.getState(state);
          },
        },
      }),
    ];
  },
});
