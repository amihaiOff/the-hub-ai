'use client';

import { useCallback } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { Markdown } from 'tiptap-markdown';
import { GripVertical } from 'lucide-react';
import {
  Bold,
  Columns2,
  Image as ImageIcon,
  Italic,
  Link2,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadPageImage } from '@/lib/hooks/use-pages';
import { Column, ColumnBlock } from './columns-extension';
import { canOutdentWithinList } from './list-indent-controls';
import { MobileBlockDragHandle } from './mobile-block-drag-handle';
import { AutoTextDirection } from './auto-text-direction';
import { SlashMenuExtension } from './slash-menu';
import { CollapsibleHeading } from './collapsible-heading';
import { TableFloatingControls } from './table-floating-controls';
import { DatabaseBlock } from './database-extension';
import { MobileEditorToolbar } from './mobile-editor-toolbar';
import { PageTocButton } from './page-toc-button';
import { AutoCapitalize } from './auto-capitalize';
import { MathInline, MathBlock } from './math-extension';

/**
 * List Tab / Shift-Tab handling:
 *
 * - Shift-Tab: outdents nested list items one level; a top-level item's
 *   Shift-Tab is swallowed so it can't be lifted out of the list into a
 *   plain paragraph.
 * - Tab: tries to sink the current list item into the previous sibling.
 *   Whether sinkListItem succeeds or not, we CONSUME the event so the
 *   browser doesn't fall through to its native tab-focus cycling — that
 *   was the "Tab jumps to the next chevron / button on the page" bug for
 *   list items where sinkListItem returns false (e.g. items whose
 *   previous sibling already has a nested list, or other structural
 *   edge cases).
 *
 * Higher priority than StarterKit's listItem so this runs first.
 */
const ListOutdentGuard = Extension.create({
  name: 'listOutdentGuard',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const inList = editor.isActive('listItem') || editor.isActive('taskItem');
        if (!inList) return false; // Not in a list — let default handling run.
        // Try to sink; swallow the event either way so focus can't escape
        // to browser tab-cycling on edge cases where sinkListItem no-ops.
        editor.chain().focus().sinkListItem('listItem').run() ||
          editor.chain().focus().sinkListItem('taskItem').run();
        return true;
      },
      'Shift-Tab': ({ editor }) => {
        const inList = editor.isActive('listItem') || editor.isActive('taskItem');
        if (!inList) return false; // Not in a list — let default handling run.
        if (canOutdentWithinList(editor)) {
          return (
            editor.chain().focus().liftListItem('listItem').run() ||
            editor.chain().focus().liftListItem('taskItem').run()
          );
        }
        // Top-level list item: consume the key so it can't leave the list.
        return true;
      },
    };
  },
});

interface PageBodyEditorProps {
  /** Initial Tiptap JSON document (or null for an empty page). Read once. */
  initialContent: unknown;
  /** Fired (debounced by the parent) with the latest JSON document. */
  onChange: (doc: unknown) => void;
  /** When a bottom tab bar is shown, lift the floating undo pill above it. */
  hasBottomTabBar?: boolean;
  /** Auto-capitalize sentence starts. Defaults to true. */
  autoCapitalize?: boolean;
  /** Whether the document is editable. Defaults to true; false = read-only view. */
  editable?: boolean;
  /**
   * Whether the "database" block can be inserted. Defaults to true. Set false to
   * omit the extension entirely — used for a database row's own body editor so a
   * row can't nest another database block inside itself (infinite recursion).
   */
  allowDatabaseBlock?: boolean;
}

/**
 * The Notion-like body editor: rich text, images (uploaded to Blob), tables,
 * links and a two-column layout. Content is stored as Tiptap JSON. The parent
 * keys this component on the page id, so it mounts fresh per page and we read
 * `initialContent` once instead of resetting on every keystroke.
 */
export function PageBodyEditor({
  initialContent,
  onChange,
  hasBottomTabBar = false,
  autoCapitalize = true,
  editable = true,
  allowDatabaseBlock = true,
}: PageBodyEditorProps) {
  const editor = useEditor(
    {
      editable,
      extensions: [
        AutoCapitalize.configure({ enabled: autoCapitalize }),
        MathInline,
        MathBlock,
        // Our CollapsibleHeading replaces StarterKit's default Heading so
        // headings gain a `collapsed` attribute and the outline-toggle UX.
        StarterKit.configure({ link: false, heading: false }),
        // Markdown-aware paste: when the clipboard only carries plain text
        // (e.g. copied from a chat, a terminal, or another markdown note),
        // parse markdown syntax — bullet/numbered lists, headings, bold,
        // etc. — into real rich-text nodes instead of pasting the literal
        // "- item" / "**bold**" characters. Rich HTML pastes are unaffected:
        // ProseMirror prefers text/html when present, so this only upgrades
        // the plain-text case. Content is still stored as Tiptap JSON — the
        // extension only affects paste, not serialization.
        Markdown.configure({ html: false, breaks: true, transformPastedText: true }),
        CollapsibleHeading.configure({ levels: [1, 2, 3] }),
        Link.configure({
          // Open links on click (the editor is always editable, and the Link
          // extension only opens a link when openOnClick is on) — links open in a
          // new tab. Editing a link still works via the toolbar Link button.
          openOnClick: true,
          // Autolinking is off: users complained that any "word.word"
          // substring (e.g. sentence.end, file.ts, npm.js) was silently
          // turned into a link. Links are now only created when the user
          // explicitly asks via the Link toolbar button.
          autolink: false,
          linkOnPaste: false,
          HTMLAttributes: {
            class: 'text-primary underline underline-offset-2',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        }),
        Image.configure({ inline: false, HTMLAttributes: { class: 'page-image' } }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        ColumnBlock,
        Column,
        // Omitted for a row's body editor so a database row can't nest another
        // database block inside itself.
        ...(allowDatabaseBlock ? [DatabaseBlock] : []),
        SlashMenuExtension,
        ListOutdentGuard,
        AutoTextDirection,
      ],
      content: (initialContent as object) ?? '',
      onUpdate: ({ editor }) => onChange(editor.getJSON()),
      editorProps: {
        attributes: {
          class: 'page-body min-h-[60vh] px-1 py-2 focus:outline-none',
        },
      },
      immediatelyRender: false,
      // Remount the editor when the auto-cap flag flips. This drops undo
      // history and cursor position on toggle, which is a fine tradeoff —
      // users toggle this setting rarely and never mid-typing. Keeps the
      // extension configuration immutable, no runtime mutation of Tiptap
      // internals required.
    },
    [autoCapitalize, editable, allowDatabaseBlock]
  );

  // Paste/drop of image files → upload to Blob and insert. Handled at the React
  // wrapper level (not in useEditor's initializer, which can't reference the
  // editor it is creating). preventDefault stops ProseMirror pasting a filename.
  const handleData = useCallback(
    (dt: DataTransfer | null, prevent: () => void) => {
      if (!editor || !dt) return;
      const images = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;
      prevent();
      for (const file of images) {
        uploadPageImage(file)
          .then((url) => editor.chain().focus().setImage({ src: url }).run())
          .catch((err) => {
            alert(err instanceof Error ? err.message : 'Image upload failed');
          });
      }
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <div
      onPaste={(e) => handleData(e.clipboardData, () => e.preventDefault())}
      onDrop={(e) => handleData(e.dataTransfer, () => e.preventDefault())}
    >
      {/* Sticky top toolbar for desktop only — on mobile the floating
          MobileEditorToolbar at the bottom takes over. */}
      <div className="hidden lg:block">
        <Toolbar editor={editor} />
      </div>
      <TableFloatingControls editor={editor} />
      {/* Six-dot drag handle floats to the left of the hovered block on
          desktop. Hidden on touch-only viewports (the block itself is
          long-press-draggable via ProseMirror's built-in NodeSelection
          + touch-drag support). */}
      {/* `nested` reaches into columns / lists so their children get the
          handle. Two custom rules exclude the `columnBlock` and `column`
          nodes themselves as drag targets — otherwise the default
          left-edge scoring picked the outer container and grabbing one
          paragraph moved both columns. Mirrors the built-in
          `listWrapperDeprioritize` rule that hides <ul>/<ol> in favour
          of the <li>. */}
      {/* `nested` reaches into columns and lists so their children get
          the drag handle. Two knobs are needed to make columns behave:
          - `edgeDetection: 'none'` disables the default "cursor near
             left/top edge → prefer parent" scoring. That default deducts
             `strength * depth = 500 * 3` from a paragraph inside a
             column, which alone exceeds the base score of 1000 and
             excludes the paragraph from the candidate set.
          - Custom rules that hard-exclude the `columnBlock` and
             `column` nodes as drag targets. Otherwise dragging near a
             column child still resolves to the outer container and
             moves both columns together (Notion's rule for `<ul>` /
             `<ol>` — see the built-in `listWrapperDeprioritize`). */}
      <DragHandle
        editor={editor}
        nested={{
          edgeDetection: 'none',
          rules: [
            {
              id: 'skip-column-block',
              evaluate: ({ node }) => (node.type.name === 'columnBlock' ? 1000 : 0),
            },
            {
              id: 'skip-column',
              evaluate: ({ node }) => (node.type.name === 'column' ? 1000 : 0),
            },
          ],
        }}
        className="hidden md:block"
      >
        {/* Shift the handle further left via `-translate-x-5` (-1.25rem) so
            it sits in the outer part of the `.page-body` left gutter,
            clear of the heading chevron (`-left-6` on the heading) and
            list-item bullets. Without this the handle overlaps both. */}
        <div
          className="text-muted-foreground/60 hover:text-foreground flex h-6 w-4 -translate-x-5 cursor-grab items-center justify-center active:cursor-grabbing"
          aria-label="Drag block"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </DragHandle>
      <EditorContent editor={editor} />
      {/* Touch/mobile block reordering — the desktop DragHandle above uses the
          HTML5 drag API, which doesn't work on touch. */}
      <MobileBlockDragHandle editor={editor} />
      {/* Consolidated floating toolbar for touch users — undo/redo, block
          type, delete/duplicate, outdent. Shown only while editing. */}
      <MobileEditorToolbar editor={editor} hasBottomTabBar={hasBottomTabBar} />
      {/* Fixed pill at the bottom-left with a heading outline for the
          current tab. Hover on desktop, tap on mobile. */}
      <PageTocButton editor={editor} hasBottomTabBar={hasBottomTabBar} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const addLink = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const onPickImage = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const url = await uploadPageImage(file);
        editor.chain().focus().setImage({ src: url }).run();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Image upload failed';
        // Offer a URL fallback when uploads aren't configured.
        const url = window.prompt(`${msg}\n\nPaste an image URL instead:`, '');
        if (url) editor.chain().focus().setImage({ src: url }).run();
      }
    },
    [editor]
  );

  // Build the file input imperatively (no React ref) so opening the picker
  // stays entirely inside an event handler.
  const openImagePicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => void onPickImage(input.files?.[0]);
    input.click();
  }, [onPickImage]);

  const btns: {
    icon: typeof Bold;
    label: string;
    on: () => void;
    active: () => boolean;
    disabled?: () => boolean;
  }[] = [
    // Undo / redo operate on ProseMirror history, so they cover every editor
    // operation — text edits, database row/column changes, block reorders.
    {
      icon: Undo2,
      label: 'Undo',
      on: () => editor.chain().focus().undo().run(),
      active: () => false,
      disabled: () => !editor.can().undo(),
    },
    {
      icon: Redo2,
      label: 'Redo',
      on: () => editor.chain().focus().redo().run(),
      active: () => false,
      disabled: () => !editor.can().redo(),
    },
    {
      icon: Bold,
      label: 'Bold',
      on: () => editor.chain().focus().toggleBold().run(),
      active: () => editor.isActive('bold'),
    },
    {
      icon: Italic,
      label: 'Italic',
      on: () => editor.chain().focus().toggleItalic().run(),
      active: () => editor.isActive('italic'),
    },
    {
      icon: Strikethrough,
      label: 'Strikethrough',
      on: () => editor.chain().focus().toggleStrike().run(),
      active: () => editor.isActive('strike'),
    },
    {
      icon: Quote,
      label: 'Quote',
      on: () => editor.chain().focus().toggleBlockquote().run(),
      active: () => editor.isActive('blockquote'),
    },
    { icon: Link2, label: 'Link', on: addLink, active: () => editor.isActive('link') },
    { icon: ImageIcon, label: 'Image', on: openImagePicker, active: () => false },
    {
      icon: TableIcon,
      label: 'Table',
      on: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      active: () => editor.isActive('table'),
    },
    {
      icon: Columns2,
      label: '2 columns',
      on: () => editor.chain().focus().setColumns().run(),
      active: () => editor.isActive('columnBlock'),
    },
  ];

  return (
    <div className="border-border/50 bg-background/80 sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-0.5 rounded-xl border p-1 backdrop-blur">
      {btns.map(({ icon: Icon, label, on, active, disabled }) => (
        <button
          key={label}
          type="button"
          onClick={on}
          disabled={disabled?.() ?? false}
          aria-label={label}
          title={label}
          className={cn(
            'hover:bg-muted/70 flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            'disabled:pointer-events-none disabled:opacity-30',
            active() ? 'bg-muted text-foreground' : 'text-muted-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
