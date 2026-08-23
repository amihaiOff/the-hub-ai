import { Extension, type Editor } from '@tiptap/core';
import { canOutdentWithinList } from './list-indent-controls';

/** List-item node names we know how to indent, in the order we try them. */
const LIST_ITEM_NAMES = ['listItem', 'taskItem'] as const;

/**
 * The list-item names this editor's schema actually registers. `sinkListItem`
 * throws on an unknown node type, and not every editor loads the task list —
 * the notes editor runs a plain StarterKit.
 */
function listItemNames(editor: Editor): string[] {
  return LIST_ITEM_NAMES.filter((name) => name in editor.schema.nodes);
}

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
        const names = listItemNames(editor);
        if (!names.some((name) => editor.isActive(name))) return false; // not in a list
        // Try to sink; swallow the event either way so focus can't escape
        // to browser tab-cycling on edge cases where sinkListItem no-ops.
        names.some((name) => editor.chain().focus().sinkListItem(name).run());
        return true;
      },
      'Shift-Tab': ({ editor }) => {
        const names = listItemNames(editor);
        if (!names.some((name) => editor.isActive(name))) return false; // not in a list
        if (canOutdentWithinList(editor)) {
          return names.some((name) => editor.chain().focus().liftListItem(name).run());
        }
        // Top-level list item: consume the key so it can't leave the list.
        return true;
      },
    };
  },
});
