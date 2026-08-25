import { Extension } from '@tiptap/core';
import { joinTextblockBackward } from '@tiptap/pm/commands';
import { canOutdentWithinList } from './list-indent-controls';
import { indentListItem, isInList, outdentListItem } from './list-commands';

/**
 * List Tab / Shift-Tab handling, shared by every Tiptap editor in the app.
 *
 * - Shift-Tab: outdents nested list items one level; a top-level item's
 *   Shift-Tab is swallowed so it can't be lifted out of the list into a
 *   plain paragraph.
 * - Tab: tries to sink the current list item into the previous sibling.
 *   Whether sinkListItem succeeds or not, we CONSUME the event so the
 *   browser doesn't fall through to its native tab-focus cycling — that
 *   was the "Tab jumps to the next chevron / button on the page" bug for
 *   list items where sinkListItem returns false (the first item of a list,
 *   items whose previous sibling already has a nested list, and other
 *   structural edge cases).
 *
 * Outside a list Tab is left alone, so it still moves focus out of the editor.
 *
 * Higher priority than StarterKit's listItem so this runs first.
 */
export const ListOutdentGuard = Extension.create({
  name: 'listOutdentGuard',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (!isInList(editor)) return false; // not in a list — let Tab move focus
        // Try to indent; swallow the event either way so focus can't escape to
        // browser tab-cycling on the cases where the indent is impossible.
        indentListItem(editor);
        return true;
      },
      'Shift-Tab': ({ editor }) => {
        if (!isInList(editor)) return false; // not in a list — let Tab move focus
        if (canOutdentWithinList(editor)) return outdentListItem(editor);
        // Top-level list item: consume the key so it can't leave the list.
        return true;
      },
    };
  },
});

/**
 * Backspace at the very start of a list item's first line MERGES it into the
 * line above (standard editor behaviour), rather than StarterKit's `ListKeymap`
 * default — which runs `liftListItem` unconditionally and thus *lifts the item
 * out of the list*, splitting the list, ejecting a bare paragraph, and (for a
 * bullet with children) promoting all of them. That made "delete a bullet in
 * the middle of a list" reorganise everything.
 *
 * `joinTextblockBackward` gives the intuitive result in every case: a non-empty
 * item's text merges into the previous line ("a"+"b" → "ab"); an empty item is
 * removed cleanly (siblings stay adjacent, children re-nest under the previous
 * item); a bullet after a paragraph merges into that paragraph. At the very
 * first block of the document it returns false and we fall through to the
 * default (nothing above to merge into).
 *
 * Only fires at the start of a list item's FIRST textblock — a second paragraph
 * inside an item, or a mid-line caret, is left to default handling. Priority
 * 1000 so it runs before ListKeymap's Backspace.
 */
export const ListBackspaceMerge = Extension.create({
  name: 'listBackspaceMerge',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) return false; // let ranges delete normally
        const { $from } = selection;
        if ($from.parentOffset !== 0) return false; // not at the start of the line
        // Require the caret to be in the FIRST child (textblock) of a list item.
        let itemDepth = -1;
        for (let d = $from.depth; d > 0; d--) {
          const name = $from.node(d).type.name;
          if (name === 'listItem' || name === 'taskItem') {
            itemDepth = d;
            break;
          }
        }
        if (itemDepth < 0) return false; // not in a list item
        if ($from.index(itemDepth) !== 0) return false; // 2nd+ block in the item
        // Merge into the block above; returns false at the doc's first block,
        // where we fall through to the default handler.
        return joinTextblockBackward(editor.state, editor.view.dispatch);
      },
    };
  },
});
