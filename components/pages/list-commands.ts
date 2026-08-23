import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

/**
 * List indent/outdent commands that are safe across editor configurations.
 *
 * Every list action in the app wants to work for both plain lists and task
 * lists, and the obvious spelling — `sinkListItem('listItem') ||
 * sinkListItem('taskItem')` — is a trap: `sinkListItem` resolves its argument
 * through `getNodeType`, which THROWS when the node isn't in the schema. Our
 * editors run StarterKit, which ships no task list, so the fallback only ever
 * ran when the first call returned false (the first item of a list) — and
 * then it threw, killing the handler mid-keystroke. For a Tab handler that
 * meant no `preventDefault`, so the browser moved focus out of the editor.
 *
 * Resolving the names from the live schema keeps the task-list support (if a
 * task list extension is ever added, it just starts working) without the
 * landmine.
 */

/** List-item node names we know how to indent, in the order we try them. */
const LIST_ITEM_NAMES = ['listItem', 'taskItem'] as const;

/** The list-item node names this editor's schema actually registers. */
export function listItemNames(editor: Editor): string[] {
  return LIST_ITEM_NAMES.filter((name) => name in editor.schema.nodes);
}

/** True when the cursor sits inside any kind of list. */
export function isInList(editor: Editor): boolean {
  return (
    listItemNames(editor).some((name) => editor.isActive(name)) ||
    editor.isActive('bulletList') ||
    editor.isActive('orderedList') ||
    editor.isActive('taskList')
  );
}

/** Nest the current list item under its previous sibling. */
export function indentListItem(editor: Editor): boolean {
  return listItemNames(editor).some((name) => editor.chain().focus().sinkListItem(name).run());
}

/**
 * Where the cursor's list item sits in the tree, or null when it isn't in one.
 *
 * `parentItemDepth` is the enclosing list item — present only for a nested
 * item, which is exactly when outdenting is meaningful.
 */
function locateListItem(editor: Editor) {
  const names = listItemNames(editor);
  const { $from } = editor.state.selection;

  let itemDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if (names.includes($from.node(d).type.name)) {
      itemDepth = d;
      break;
    }
  }
  if (itemDepth < 0) return null;

  // listItem → list (ul/ol) → listItem, so the enclosing item is two up.
  const listDepth = itemDepth - 1;
  const parentItemDepth = itemDepth - 2;
  const nested = parentItemDepth >= 1 && names.includes($from.node(parentItemDepth).type.name);

  return { $from, itemDepth, listDepth, parentItemDepth, nested };
}

/**
 * Lift the current list item out one level, **leaving the items below it
 * where they are**.
 *
 * ProseMirror's own `liftListItem` deliberately re-parents any following
 * siblings into the item being lifted — that keeps their absolute indentation
 * but silently changes who their parent is, which reads to a user as "the
 * bullets below moved with me" (and then track the wrong parent forever
 * after: indent it and they indent too). Every outliner people actually use
 * (Notion, Workflowy, Bear) leaves the siblings under the original parent.
 *
 * So instead of lifting, we move: cut the item out of its sub-list and
 * re-insert it directly after the item that used to contain it. Its own
 * children travel with it, its former siblings don't move at all.
 */
export function outdentListItem(editor: Editor): boolean {
  const loc = locateListItem(editor);
  // Top-level items are left alone — outdenting one would drop it out of the
  // list into a bare paragraph, which is never what the outdent control means.
  if (!loc || !loc.nested) return false;

  const { $from, itemDepth, listDepth, parentItemDepth } = loc;
  const item = $from.node(itemDepth);
  const itemStart = $from.before(itemDepth);
  const itemEnd = $from.after(itemDepth);
  const list = $from.node(listDepth);
  const parentItemEnd = $from.after(parentItemDepth);
  // Distance from the item's own start, so the caret lands in the same spot
  // after the move.
  const caretOffset = $from.pos - itemStart;

  const { tr } = editor.state;
  // Removing the last child would leave an empty list node behind; drop the
  // whole list in that case.
  if (list.childCount === 1) tr.delete($from.before(listDepth), $from.after(listDepth));
  else tr.delete(itemStart, itemEnd);

  const insertAt = tr.mapping.map(parentItemEnd);
  tr.insert(insertAt, item);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + caretOffset)));

  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}
