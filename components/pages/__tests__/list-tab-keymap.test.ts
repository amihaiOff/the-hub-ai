/**
 * @jest-environment jsdom
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ListOutdentGuard } from '../list-tab-keymap';

/**
 * Covers the shared Tab / Shift-Tab list keymap used by the page body editor
 * and the notes editor (dashboard scratchpad + task notes).
 *
 * The bug it fixes: StarterKit binds Tab to `sinkListItem`, which refuses to
 * nest the FIRST item of a list (no preceding sibling to nest under). The
 * command returns false, ProseMirror never calls preventDefault, and the
 * browser moves focus out of the editor — "Tab doesn't indent, it jumps to
 * another element on the page". The guard consumes the key whenever the
 * cursor is in a list, and leaves it alone everywhere else so Tab can still
 * move focus out of a plain paragraph.
 *
 * Driven headlessly the same way the sibling list-indent-controls test is:
 * keys go in through ProseMirror's `handleKeyDown` prop, which is what the
 * keymap plugin actually listens on.
 */

/** StarterKit plus the guard, i.e. what both editors now load. */
function makeEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, ListOutdentGuard],
    content,
  });
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

/** Send Tab (or Shift-Tab); returns true when the editor consumed the key. */
function pressTab(editor: Editor, { shift = false } = {}): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift });
  return editor.view.someProp('handleKeyDown', (fn) => fn(editor.view, event)) === true;
}

/** Depth of the list item holding `text`, counted in listItem ancestors. */
function depthOf(editor: Editor, text: string): number {
  placeCursorIn(editor, text);
  const { $from } = editor.state.selection;
  let count = 0;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'listItem') count++;
  }
  return count;
}

const TWO_ITEMS = '<ul><li><p>first</p></li><li><p>second</p></li></ul>';
const NESTED = '<ul><li><p>parent</p><ul><li><p>child</p></li></ul></li></ul>';

describe('ListOutdentGuard — Tab', () => {
  it('indents an item that has a sibling above it', () => {
    const editor = makeEditor(TWO_ITEMS);
    placeCursorIn(editor, 'second');

    expect(pressTab(editor)).toBe(true);
    expect(depthOf(editor, 'second')).toBe(2);
    editor.destroy();
  });

  it('consumes Tab on the first item, where indenting is impossible', () => {
    const editor = makeEditor(TWO_ITEMS);
    placeCursorIn(editor, 'first');
    const before = editor.getHTML();

    // Consumed (true) is the whole point — otherwise the browser moves focus.
    expect(pressTab(editor)).toBe(true);
    expect(editor.getHTML()).toBe(before);
    editor.destroy();
  });

  it('is what stops the bug: bare StarterKit lets Tab through on the first item', () => {
    // Regression anchor — this is the pre-fix behaviour. A false return means
    // ProseMirror never preventDefault()s and the browser tabs focus away.
    const bare = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit],
      content: TWO_ITEMS,
    });
    placeCursorIn(bare, 'first');
    expect(pressTab(bare)).toBe(false);
    bare.destroy();
  });

  it('leaves Tab alone outside a list so it can still move focus', () => {
    const editor = makeEditor('<p>just a paragraph</p>');
    placeCursorIn(editor, 'just a paragraph');

    expect(pressTab(editor)).toBe(false);
    editor.destroy();
  });
});

describe('ListOutdentGuard — Shift-Tab', () => {
  it('outdents a nested item back to its parent level', () => {
    const editor = makeEditor(NESTED);
    placeCursorIn(editor, 'child');
    expect(depthOf(editor, 'child')).toBe(2);

    placeCursorIn(editor, 'child');
    expect(pressTab(editor, { shift: true })).toBe(true);
    expect(depthOf(editor, 'child')).toBe(1);
    editor.destroy();
  });

  it('consumes Shift-Tab on a top-level item instead of lifting it out of the list', () => {
    const editor = makeEditor(TWO_ITEMS);
    placeCursorIn(editor, 'first');
    const before = editor.getHTML();

    expect(pressTab(editor, { shift: true })).toBe(true);
    expect(editor.getHTML()).toBe(before);
    editor.destroy();
  });

  it('leaves Shift-Tab alone outside a list', () => {
    const editor = makeEditor('<p>plain</p>');
    placeCursorIn(editor, 'plain');

    expect(pressTab(editor, { shift: true })).toBe(false);
    editor.destroy();
  });
});
