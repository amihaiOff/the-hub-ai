/**
 * @jest-environment jsdom
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AutoTextDirection, DIR_BLOCK_TYPES } from '../auto-text-direction';

function makeEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, AutoTextDirection],
    content,
  });
}

/** Collect every node in the doc that carries a `dir` attribute. */
function nodesWithDir(editor: Editor): { type: string; dir: unknown }[] {
  const out: { type: string; dir: unknown }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.attrs && 'dir' in node.attrs) out.push({ type: node.type.name, dir: node.attrs.dir });
    return true;
  });
  return out;
}

describe('AutoTextDirection', () => {
  it('defaults dir to "auto" on the listed block types when parsing content without dir', () => {
    const editor = makeEditor(
      '<h1>Title</h1><p>hello</p><ul><li><p>one</p></li></ul><blockquote><p>q</p></blockquote>'
    );
    const dirs = nodesWithDir(editor);
    // Every node that gained the attribute defaults to "auto".
    expect(dirs.length).toBeGreaterThan(0);
    for (const n of dirs) expect(n.dir).toBe('auto');
    // The key block types are covered.
    const types = new Set(dirs.map((d) => d.type));
    for (const t of ['paragraph', 'heading', 'listItem', 'bulletList', 'blockquote']) {
      expect(types.has(t)).toBe(true);
    }
    editor.destroy();
  });

  it('renders dir onto the DOM element', () => {
    const editor = makeEditor('<p>hello</p>');
    expect(editor.getHTML()).toContain('dir="auto"');
    editor.destroy();
  });

  it('preserves an explicit dir from parsed HTML', () => {
    const editor = makeEditor('<p dir="rtl">שלום</p>');
    const para = nodesWithDir(editor).find((n) => n.type === 'paragraph');
    expect(para?.dir).toBe('rtl');
    editor.destroy();
  });

  it('does not attach dir to nodes outside the listed types (e.g. text/doc)', () => {
    const editor = makeEditor('<p>hello</p>');
    const dirs = nodesWithDir(editor);
    for (const n of dirs)
      expect(DIR_BLOCK_TYPES).toContain(n.type as (typeof DIR_BLOCK_TYPES)[number]);
    editor.destroy();
  });
});
