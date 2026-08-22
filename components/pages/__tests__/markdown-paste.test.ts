/**
 * @jest-environment jsdom
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

/**
 * Covers the plain-text-markdown paste upgrade added to the page body editor
 * (`page-body-editor.tsx`): pasting plain text that happens to be markdown —
 * bullet/numbered lists, bold, headings — should become real rich-text nodes
 * rather than the literal "- item" / "**bold**" characters.
 *
 * A full render of PageBodyEditor (a `useEditor` client component wired to
 * DragHandle, image upload, slash menu, etc.) would be heavy and brittle to
 * mock. Instead we exercise the exact StarterKit + Markdown extension pair the
 * editor is configured with, headlessly, the same way the sibling
 * list-indent-controls test drives a headless Tiptap editor. Markdown parsing
 * happens in ProseMirror/markdown-it and is independent of the React wrapper,
 * so this is the meaningful unit under test.
 */

/** StarterKit + Markdown, configured exactly as page-body-editor.tsx does. */
function makeMarkdownEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ link: false, heading: false }),
      Markdown.configure({ html: false, breaks: true, transformPastedText: true }),
    ],
    content: '',
  });
}

/** Same StarterKit config but WITHOUT the Markdown extension (the pre-fix state). */
function makePlainEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ link: false, heading: false })],
    content: '',
  });
}

/** Node type names present anywhere in the document, in document order. */
function nodeTypes(editor: Editor): string[] {
  const types: string[] = [];
  editor.state.doc.descendants((node) => {
    types.push(node.type.name);
    return true;
  });
  return types;
}

describe('page body editor markdown paste upgrade', () => {
  it('exposes the tiptap-markdown parser on editor storage', () => {
    const editor = makeMarkdownEditor();
    // The extension registers `storage.markdown.parser`; its absence would mean
    // the extension isn't wired in and the paste upgrade can't happen.
    // tiptap-markdown doesn't augment Tiptap's Storage type, so read it via a
    // narrow local shape rather than `any`.
    const markdown = (
      editor.storage as { markdown?: { parser?: { parse: (input: string) => string } } }
    ).markdown;
    expect(markdown?.parser).toBeDefined();
    expect(markdown!.parser!.parse('- a\n- b')).toContain('<ul>');
    editor.destroy();
  });

  it('parses a bullet list into bulletList / listItem nodes', () => {
    const editor = makeMarkdownEditor();
    editor.commands.setContent('- a\n- b');
    const types = nodeTypes(editor);
    expect(types).toContain('bulletList');
    expect(types.filter((t) => t === 'listItem')).toHaveLength(2);
    editor.destroy();
  });

  it('parses a numbered list into orderedList / listItem nodes', () => {
    const editor = makeMarkdownEditor();
    editor.commands.setContent('1. one\n2. two');
    const types = nodeTypes(editor);
    expect(types).toContain('orderedList');
    expect(types.filter((t) => t === 'listItem')).toHaveLength(2);
    editor.destroy();
  });

  it('parses inline **bold** into a bold mark, not literal asterisks', () => {
    const editor = makeMarkdownEditor();
    editor.commands.setContent('**bold**');
    const html = editor.getHTML();
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('**');
    editor.destroy();
  });

  it('without the Markdown extension the same text stays literal (guards the fix)', () => {
    const editor = makePlainEditor();
    editor.commands.setContent('- a\n- b');
    const types = nodeTypes(editor);
    // Pre-fix behaviour: no list nodes, the markdown is kept as plain text.
    expect(types).not.toContain('bulletList');
    expect(editor.getText()).toContain('- a');
    editor.destroy();
  });
});
