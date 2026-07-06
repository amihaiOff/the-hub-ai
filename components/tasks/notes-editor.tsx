'use client';

import { useEffect, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Markdown } from 'tiptap-markdown';
import { Bold, Italic, Link2, List, ListOrdered, Strikethrough, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotesEditorProps {
  /**
   * The current note value as markdown. When it changes externally
   * (e.g. after switching between tasks) the editor reloads its
   * content.
   */
  value: string;
  onChange: (markdown: string) => void;
  /** Fired when the editor loses focus — used to flush pending saves. */
  onBlur?: () => void;
  placeholder?: string;
}

/**
 * WYSIWYG editor that reads and writes markdown. Existing plain-text
 * notes render as ordinary paragraphs, so no migration is needed. The
 * toolbar buttons trigger real Tiptap commands (bold, italic, lists,
 * link) — no more decorative-only icons.
 */
export function NotesEditor({ value, onChange, onBlur, placeholder }: NotesEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We wire our own link extension below so we can customise its
        // click behaviour later without fighting the default one.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-2',
        },
      }),
      Markdown.configure({
        html: false, // avoid injecting raw HTML users didn't type
        breaks: true, // treat single newlines as <br> to match Notion-ish feel
        transformPastedText: true,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      // tiptap-markdown exposes getMarkdown() on editor.storage.markdown.
      const md = (
        editor.storage as unknown as { markdown: { getMarkdown: () => string } }
      ).markdown.getMarkdown() as string;
      onChange(md);
    },
    onBlur: () => onBlur?.(),
    editorProps: {
      attributes: {
        // Scoped prose styles live in globals.css under `.notes-editor
        // .ProseMirror`. The parent .notes-editor class enables them.
        class: cn('min-h-[9rem] px-4 py-3 text-sm focus:outline-none'),
        'data-placeholder': placeholder ?? '',
      },
    },
    immediatelyRender: false,
  });

  // Keep the editor in sync when we switch tasks (parent re-mounts the
  // sheet body with a fresh `value`). For same-task edits we skip the
  // reset — otherwise every keystroke would reload the editor and blow
  // away the cursor position.
  useEffect(() => {
    if (!editor) return;
    const storage = editor.storage as unknown as { markdown?: { getMarkdown: () => string } };
    const current = storage.markdown?.getMarkdown();
    if (current === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="notes-editor bg-muted/40 rounded-2xl">
      <NotesToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function NotesToolbar({ editor }: { editor: Editor | null }) {
  // `hovered` is the transient hover state; `pinned` sticks the toolbar
  // open after a click so touch users (no hover) still get access.
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  if (!editor) return null;

  const buttons = [
    {
      icon: Bold,
      label: 'Bold',
      onClick: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive('bold'),
    },
    {
      icon: Italic,
      label: 'Italic',
      onClick: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive('italic'),
    },
    {
      icon: Strikethrough,
      label: 'Strikethrough',
      onClick: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive('strike'),
    },
    {
      icon: List,
      label: 'Bullet list',
      onClick: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive('bulletList'),
    },
    {
      icon: ListOrdered,
      label: 'Numbered list',
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive('orderedList'),
    },
    {
      icon: Link2,
      label: 'Link',
      onClick: () => {
        const previous = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('Link URL', previous ?? '');
        if (url === null) return; // cancelled
        if (url === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      },
      isActive: () => editor.isActive('link'),
    },
  ];

  return (
    <div
      className="flex items-center px-2 py-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={open ? 'Hide formatting' : 'Show formatting'}
        title="Formatting"
        aria-expanded={open}
        onClick={() => setPinned((v) => !v)}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
          pinned
            ? 'bg-primary/15 text-primary'
            : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground backdrop-blur-sm'
        )}
      >
        <Type className="h-3.5 w-3.5" />
      </button>

      {/* Expanded button strip. Uses max-width + opacity for the slide-out
          animation; overflow-hidden clips the buttons while collapsed
          without touching the DOM (so ARIA state stays valid). */}
      <div
        className={cn(
          'flex items-center gap-0.5 overflow-hidden transition-all duration-200 ease-out',
          open ? 'ml-1.5 max-w-[280px] opacity-100' : 'ml-0 max-w-0 opacity-0'
        )}
        aria-hidden={!open}
      >
        {buttons.map(({ icon: Icon, label, onClick, isActive }) => {
          const active = isActive();
          return (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={active}
              onClick={onClick}
              tabIndex={open ? 0 : -1}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
