/**
 * @jest-environment jsdom
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { listItemDepth, canOutdentWithinList } from '../list-indent-controls';

/**
 * Build a headless Tiptap editor with the given HTML content. StarterKit
 * provides bulletList / listItem / paragraph — the same list nodes the page
 * body editor uses.
 */
function makeEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit],
    content,
  });
}

/** Put the cursor just inside the first text node containing `text`. */
function placeCursorIn(editor: Editor, text: string) {
  let target: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (target === null && node.isText && node.text?.includes(text)) {
      target = pos + 1;
    }
    return true;
  });
  if (target === null) throw new Error(`text not found: ${text}`);
  editor.commands.setTextSelection(target);
}

describe('list-indent-controls helpers', () => {
  it('reports depth 0 outside any list', () => {
    const editor = makeEditor('<p>just a paragraph</p>');
    placeCursorIn(editor, 'just a paragraph');
    expect(listItemDepth(editor)).toBe(0);
    expect(canOutdentWithinList(editor)).toBe(false);
    editor.destroy();
  });

  it('reports depth 1 for a top-level list item and blocks outdent', () => {
    const editor = makeEditor('<ul><li><p>top level item</p></li></ul>');
    placeCursorIn(editor, 'top level item');
    expect(listItemDepth(editor)).toBe(1);
    // Outdenting here would lift the item out of the list — not allowed.
    expect(canOutdentWithinList(editor)).toBe(false);
    editor.destroy();
  });

  it('reports depth >= 2 for a nested list item and allows outdent', () => {
    const editor = makeEditor('<ul><li><p>parent</p><ul><li><p>child item</p></li></ul></li></ul>');
    placeCursorIn(editor, 'child item');
    expect(listItemDepth(editor)).toBeGreaterThanOrEqual(2);
    // Outdenting a nested item keeps it inside the outer list — allowed.
    expect(canOutdentWithinList(editor)).toBe(true);
    editor.destroy();
  });

  it('still blocks outdent for the parent of a nested list', () => {
    const editor = makeEditor('<ul><li><p>parent row</p><ul><li><p>child</p></li></ul></li></ul>');
    placeCursorIn(editor, 'parent row');
    expect(listItemDepth(editor)).toBe(1);
    expect(canOutdentWithinList(editor)).toBe(false);
    editor.destroy();
  });
});
