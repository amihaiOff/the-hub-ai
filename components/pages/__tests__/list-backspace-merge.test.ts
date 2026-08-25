/**
 * @jest-environment jsdom
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ListBackspaceMerge } from '../list-tab-keymap';

/**
 * Backspace at the start of a list item must MERGE into the line above, not
 * lift the item out of the list. Fires a real Backspace through the full keymap
 * stack (incl. StarterKit's ListKeymap) so this also proves ListBackspaceMerge's
 * priority pre-empts ListKeymap's default liftListItem.
 */
function makeEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, ListBackspaceMerge],
    content,
  });
}

/** Caret at the start of the paragraph whose text === `text` ('' = empty). */
function caretAtStartOf(editor: Editor, text: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, p) => {
    if (pos === null && node.type.name === 'paragraph' && node.textContent === text) pos = p + 1;
    return true;
  });
  if (pos === null) throw new Error(`paragraph not found: "${text}"`);
  editor.commands.setTextSelection(pos);
}

function pressBackspace(editor: Editor): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Backspace' });
  return editor.view.someProp('handleKeyDown', (fn) => fn(editor.view, event)) === true;
}

describe('ListBackspaceMerge', () => {
  it('merges a non-empty middle bullet into the one above (a+b → "ab"), list intact', () => {
    const editor = makeEditor('<ul><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ul>');
    caretAtStartOf(editor, 'b');
    expect(pressBackspace(editor)).toBe(true);
    expect(editor.getHTML()).toContain('<ul><li><p>ab</p></li><li><p>c</p></li></ul>');
    // List not split into two (the old bug ejected "b" into a <p> between <ul>s).
    expect((editor.getHTML().match(/<ul>/g) ?? []).length).toBe(1);
    editor.destroy();
  });

  it('cleanly removes an empty middle bullet, leaving siblings adjacent', () => {
    const editor = makeEditor('<ul><li><p>a</p></li><li><p></p></li><li><p>c</p></li></ul>');
    caretAtStartOf(editor, '');
    expect(pressBackspace(editor)).toBe(true);
    expect(editor.getHTML()).toContain('<ul><li><p>a</p></li><li><p>c</p></li></ul>');
    editor.destroy();
  });

  it('removes an empty parent bullet and re-nests its children under the previous item (no split)', () => {
    const editor = makeEditor(
      '<ul><li><p>a</p></li><li><p></p><ul><li><p>c1</p></li><li><p>c2</p></li></ul></li></ul>'
    );
    caretAtStartOf(editor, '');
    expect(pressBackspace(editor)).toBe(true);
    expect(editor.getHTML()).toContain(
      '<ul><li><p>a</p><ul><li><p>c1</p></li><li><p>c2</p></li></ul></li></ul>'
    );
    editor.destroy();
  });

  it('merges a first child into its parent line', () => {
    const editor = makeEditor(
      '<ul><li><p>parent</p><ul><li><p>x</p></li><li><p>y</p></li></ul></li></ul>'
    );
    caretAtStartOf(editor, 'x');
    expect(pressBackspace(editor)).toBe(true);
    expect(editor.getHTML()).toContain('<p>parentx</p>');
    editor.destroy();
  });

  it('merges a first bullet into a preceding paragraph (no dead keystroke)', () => {
    const editor = makeEditor('<p>intro</p><ul><li><p>a</p></li><li><p>b</p></li></ul>');
    caretAtStartOf(editor, 'a');
    expect(pressBackspace(editor)).toBe(true);
    expect(editor.getHTML()).toContain('<p>introa</p>');
    editor.destroy();
  });

  it('merges within an ordered list too', () => {
    const editor = makeEditor('<ol><li><p>a</p></li><li><p>b</p></li></ol>');
    caretAtStartOf(editor, 'b');
    expect(pressBackspace(editor)).toBe(true);
    expect(editor.getHTML()).toContain('<ol><li><p>ab</p></li></ol>');
    expect((editor.getHTML().match(/<ol>/g) ?? []).length).toBe(1);
    editor.destroy();
  });

  it('leaves a non-empty range selection to normal delete', () => {
    const editor = makeEditor('<ul><li><p>a</p></li><li><p>bbb</p></li></ul>');
    // select all of "bbb"
    let start = 0;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'paragraph' && node.textContent === 'bbb') start = p + 1;
      return true;
    });
    editor.commands.setTextSelection({ from: start, to: start + 3 });
    pressBackspace(editor); // range delete handled by default keymap
    expect(editor.getHTML()).toContain('<ul><li><p>a</p></li><li><p></p></li></ul>');
    editor.destroy();
  });

  it('falls through at the very first block of the doc (list lifts, standard)', () => {
    const editor = makeEditor('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    caretAtStartOf(editor, 'a');
    pressBackspace(editor);
    // joinTextblockBackward returns false at doc start → default lifts the first
    // item out to a paragraph (nothing above to merge into).
    expect(editor.getHTML()).toContain('<p>a</p>');
    editor.destroy();
  });

  it('leaves a mid-line caret to normal character deletion', () => {
    const editor = makeEditor('<ul><li><p>hello</p></li></ul>');
    // caret between "hel" and "lo"
    let pos = 0;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'paragraph' && node.textContent === 'hello') pos = p + 1 + 3;
      return true;
    });
    editor.commands.setTextSelection(pos);
    // Our handler must NOT claim this — it should fall through to char delete.
    expect(pressBackspace(editor)).toBe(false);
    editor.destroy();
  });
});
