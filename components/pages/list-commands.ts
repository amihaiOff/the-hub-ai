import type { Editor } from '@tiptap/core';

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
 * Outdent the current list item one level, using ProseMirror's standard
 * `liftListItem`. This keeps the item **in its vertical place** and re-parents
 * any following siblings underneath it — the behaviour every outliner (Notion,
 * Workflowy, Bear) uses and what users expect.
 *
 * A previous hand-rolled version tried to instead *move* the item after its old
 * parent so siblings wouldn't re-parent — but that dropped the outdented item
 * BELOW all its former siblings (a jarring reorder: "unindent moved it to the
 * bottom of the group"). Standard lifting avoids that. Schema-safe name
 * resolution (see `listItemNames`) keeps this from throwing on editors without
 * a task list. The caller only invokes this when nested (see
 * `canOutdentWithinList`), so a top-level item is never lifted into a paragraph.
 */
export function outdentListItem(editor: Editor): boolean {
  return listItemNames(editor).some((name) => editor.chain().focus().liftListItem(name).run());
}
