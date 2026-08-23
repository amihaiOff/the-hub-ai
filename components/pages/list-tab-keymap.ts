import { Extension } from '@tiptap/core';
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
