/**
 * @jest-environment jsdom
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { indentListItem, isInList, listItemNames, outdentListItem } from '../list-commands';

/**
 * These helpers exist because `sinkListItem` / `liftListItem` THROW on a node
 * type the schema doesn't have, and StarterKit ships no task list. The old
 * `sinkListItem('listItem') || sinkListItem('taskItem')` spelling therefore
 * blew up in exactly the case where the first call returns false — the first
 * item of a list — which is what made Tab move focus out of the editor on
 * Areas pages, and what made the floating indent button dead there.
 */

function makeEditor(content: string): Editor {
  return new Editor({ element: document.createElement('div'), extensions: [StarterKit], content });
}

/** Put the cursor just inside the first text node containing `text`. */
function placeCursorIn(editor: Editor, text: string) {
  let target: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (target === null && node.isText && node.text?.includes(text)) target = pos + 1;
    return true;
  });
  if (target === null) throw new Error(`text not found: ${text}`);
  editor.commands.setTextSelection(target);
}

const TWO_ITEMS = '<ul><li><p>first</p></li><li><p>second</p></li></ul>';
const NESTED = '<ul><li><p>parent</p><ul><li><p>child</p></li></ul></li></ul>';

describe('listItemNames', () => {
  it('only reports node names the schema actually registers', () => {
    const editor = makeEditor(TWO_ITEMS);
    // StarterKit has listItem but no taskItem — passing the latter to
    // sinkListItem would throw.
    expect(listItemNames(editor)).toEqual(['listItem']);
    expect('taskItem' in editor.schema.nodes).toBe(false);
    editor.destroy();
  });
});

describe('isInList', () => {
  it('is true inside a list item and false in a plain paragraph', () => {
    const editor = makeEditor(`${TWO_ITEMS}<p>outside</p>`);
    placeCursorIn(editor, 'first');
    expect(isInList(editor)).toBe(true);

    placeCursorIn(editor, 'outside');
    expect(isInList(editor)).toBe(false);
    editor.destroy();
  });
});

describe('indentListItem', () => {
  it('nests an item under its previous sibling', () => {
    const editor = makeEditor(TWO_ITEMS);
    placeCursorIn(editor, 'second');

    expect(indentListItem(editor)).toBe(true);
    expect(editor.getHTML()).toContain('<ul><li><p>second</p></li></ul>');
    editor.destroy();
  });

  it('returns false — and does not throw — on the first item', () => {
    const editor = makeEditor(TWO_ITEMS);
    placeCursorIn(editor, 'first');

    expect(() => indentListItem(editor)).not.toThrow();
    expect(indentListItem(editor)).toBe(false);
    editor.destroy();
  });
});

describe('outdentListItem', () => {
  it('lifts a nested item one level', () => {
    const editor = makeEditor(NESTED);
    placeCursorIn(editor, 'child');

    expect(outdentListItem(editor)).toBe(true);
    expect(editor.getHTML()).not.toContain('<ul><li><p>child</p></li></ul>');
    editor.destroy();
  });

  it('does not throw on a top-level item', () => {
    const editor = makeEditor(TWO_ITEMS);
    placeCursorIn(editor, 'first');

    expect(() => outdentListItem(editor)).not.toThrow();
    editor.destroy();
  });
});
