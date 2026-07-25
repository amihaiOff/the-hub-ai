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
import { ListIndentControls, canOutdentWithinList } from './list-indent-controls';
import { MobileBlockDragHandle } from './mobile-block-drag-handle';
import { AutoTextDirection } from './auto-text-direction';
import { SlashMenuExtension } from './slash-menu';
import { CollapsibleHeading } from './collapsible-heading';
import { TableFloatingControls } from './table-floating-controls';
import { DatabaseBlock } from './database-extension';
import { UndoRedoBar } from './undo-redo-bar';

/**
 * Keeps Shift-Tab (outdent) from lifting a top-level list item out of the
 * list into a plain paragraph. Nested items still outdent one level toward
 * their parent; a top-level item's Shift-Tab is swallowed so the item stays
 * in the list. Higher priority than StarterKit's listItem so this runs first.
 */
const ListOutdentGuard = Extension.create({
  name: 'listOutdentGuard',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
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
}: PageBodyEditorProps) {
  const editor = useEditor({
    extensions: [
      // Our CollapsibleHeading replaces StarterKit's default Heading so
      // headings gain a `collapsed` attribute and the outline-toggle UX.
      StarterKit.configure({ link: false, heading: false }),
      CollapsibleHeading.configure({ levels: [1, 2, 3] }),
      Link.configure({
        // Open links on click (the editor is always editable, and the Link
        // extension only opens a link when openOnClick is on) — links open in a
        // new tab. Editing a link still works via the toolbar Link button.
        openOnClick: true,
        autolink: true,
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
      DatabaseBlock,
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
  });

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
      <Toolbar editor={editor} />
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
        <div
          className="text-muted-foreground/60 hover:text-foreground flex h-6 w-4 cursor-grab items-center justify-center active:cursor-grabbing"
          aria-label="Drag block"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </DragHandle>
      <EditorContent editor={editor} />
      <ListIndentControls editor={editor} />
      {/* Touch/mobile block reordering — the desktop DragHandle above uses the
          HTML5 drag API, which doesn't work on touch. */}
      <MobileBlockDragHandle editor={editor} />
      {/* Floating undo/redo arrows for touch users. Ctrl/Cmd-Z still works
          on desktop via Tiptap's built-in history keymap. */}
      <UndoRedoBar editor={editor} liftAboveTabBar={hasBottomTabBar} />
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
