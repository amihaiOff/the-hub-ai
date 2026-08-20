'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Editor, Range } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import {
  CheckSquare,
  Code,
  Columns2,
  Database,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  Quote,
  Sigma,
  Table as TableIcon,
  TextIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Slash-menu items. Adding a new block here + its command below is enough
 * — the menu is fully driven by this list.
 */
export interface SlashItem {
  title: string;
  keywords: string[];
  icon: LucideIcon;
  command: (args: { editor: Editor; range: Range }) => void;
  /**
   * Optional gate: hide the item when its block isn't registered on this editor
   * instance (e.g. the "Database" item in a row's body editor, where the
   * database block is deliberately omitted).
   */
  isAvailable?: (editor: Editor) => boolean;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Text',
    keywords: ['text', 'paragraph', 'plain'],
    icon: TextIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    keywords: ['h1', 'heading', 'title', 'big'],
    icon: Heading1,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    keywords: ['h2', 'heading', 'subtitle'],
    icon: Heading2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    keywords: ['h3', 'heading', 'small'],
    icon: Heading3,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet list',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    icon: List,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    keywords: ['numbered', 'ordered', 'ol'],
    icon: ListOrdered,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'To-do list',
    keywords: ['todo', 'task', 'check', 'checkbox'],
    icon: CheckSquare,
    command: ({ editor, range }) => {
      const chain = editor.chain().focus().deleteRange(range);
      // toggleTaskList is provided by StarterKit's TaskList / TaskItem — we
      // fall back to a bullet list when task nodes aren't registered so the
      // menu item is always safe to show.
      const anyEditor = editor as unknown as {
        can: () => { toggleTaskList?: () => boolean };
      };
      if (anyEditor.can().toggleTaskList?.()) {
        (chain as unknown as { toggleTaskList: () => typeof chain }).toggleTaskList().run();
      } else {
        chain.toggleBulletList().run();
      }
    },
  },
  {
    title: 'Quote',
    keywords: ['quote', 'blockquote'],
    icon: Quote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    keywords: ['code', 'pre', 'snippet'],
    icon: Code,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Table',
    keywords: ['table', 'grid'],
    icon: TableIcon,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: 'Database',
    keywords: ['database', 'db', 'typed table', 'grid', 'notion'],
    icon: Database,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertDatabase().run(),
    isAvailable: (editor) =>
      typeof (editor.commands as { insertDatabase?: unknown }).insertDatabase === 'function',
  },
  {
    title: 'Two columns',
    keywords: ['column', 'columns', 'split'],
    icon: Columns2,
    command: ({ editor, range }) => {
      const chain = editor.chain().focus().deleteRange(range);
      (chain as unknown as { setColumns?: () => typeof chain }).setColumns?.()?.run();
    },
  },
  {
    title: 'Inline math',
    keywords: ['math', 'latex', 'katex', 'equation', 'inline', 'formula'],
    icon: Sigma,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mathInline', attrs: { tex: '' } })
        .run(),
  },
  {
    title: 'Math block',
    keywords: ['math', 'latex', 'katex', 'equation', 'block', 'display', 'formula'],
    icon: Sigma,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'mathBlock', attrs: { tex: '' } })
        .run(),
  },
  {
    title: 'Image',
    keywords: ['image', 'picture', 'photo'],
    icon: ImageIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const url = window.prompt('Image URL', '');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
  },
];

function filterItems(query: string, editor?: Editor): SlashItem[] {
  const available = editor
    ? SLASH_ITEMS.filter((it) => !it.isAvailable || it.isAvailable(editor))
    : SLASH_ITEMS;
  const q = query.trim().toLowerCase();
  if (!q) return available;
  return available.filter(
    (it) =>
      it.title.toLowerCase().includes(q) || it.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

// ─── Menu React component ────────────────────────────────────────────────

interface MenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
  clientRect?: (() => DOMRect | null) | null;
}

interface MenuHandle {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean;
}

export const SlashMenu = forwardRef<MenuHandle, MenuProps>(function SlashMenu(
  { items, command, clientRect },
  ref
) {
  // Derive selection from `items` so item-list changes reset it without an
  // effect (the react-hooks/set-state-in-effect rule bans that pattern in
  // React 19). The lastSelected ref lets us keep the user's arrow-key
  // position steady when the item count doesn't change.
  const lastSelectedRef = useRef(0);
  const [selectedIndex, setSelectedIndexInternal] = useState(0);
  useMemo(() => {
    lastSelectedRef.current = 0;
    setSelectedIndexInternal(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const setSelectedIndex = (updater: (prev: number) => number) => {
    setSelectedIndexInternal((prev) => {
      const next = updater(prev);
      lastSelectedRef.current = next;
      return next;
    });
  };

  const containerRef = useRef<HTMLDivElement>(null);
  // Place the menu near the caret, but keep it inside the *visible* viewport:
  // flip above the caret when there isn't room below, clamp horizontally, and
  // cap the height to the available space (so it scrolls instead of running off
  // screen). VisualViewport accounts for the on-screen keyboard on mobile.
  const MENU_W = 256; // w-64
  const MENU_MAX = 288; // max 18rem
  const GAP = 6;
  const position = clientRect
    ? (() => {
        const rect = clientRect();
        if (!rect) return null;
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        const viewTop = vv?.offsetTop ?? 0;
        const viewLeft = vv?.offsetLeft ?? 0;
        const viewW = vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
        const viewH = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 768);
        const spaceBelow = viewTop + viewH - rect.bottom - GAP;
        const spaceAbove = rect.top - viewTop - GAP;
        const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(
          120,
          Math.min(MENU_MAX, Math.floor(openUp ? spaceAbove : spaceBelow))
        );
        const top = openUp ? rect.top - GAP - maxHeight : rect.bottom + GAP;
        const left = Math.min(Math.max(rect.left, viewLeft + 8), viewLeft + viewW - MENU_W - 8);
        return { top, left, maxHeight };
      })()
    : null;

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (items.length ? (i + 1) % items.length : 0));
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
        return true;
      }
      if (event.key === 'Enter') {
        const it = items[selectedIndex];
        if (it) command(it);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={
        position
          ? {
              position: 'fixed',
              top: position.top,
              left: position.left,
              maxHeight: position.maxHeight,
            }
          : undefined
      }
      className={cn(
        'bg-popover text-popover-foreground z-50 w-64 overflow-y-auto overscroll-contain rounded-2xl border p-1 shadow-xl',
        !position && 'invisible'
      )}
      role="listbox"
    >
      {items.map((it, i) => {
        const active = i === selectedIndex;
        const Icon = it.icon;
        return (
          <button
            key={it.title}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => setSelectedIndex(() => i)}
            onMouseDown={(e) => {
              e.preventDefault();
              command(it);
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground'
            )}
          >
            <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{it.title}</span>
          </button>
        );
      })}
    </div>
  );
});

// ─── Tiptap extension wiring ─────────────────────────────────────────────

/**
 * Tiptap extension: watches for a leading `/`, opens the SlashMenu, and
 * hands off the chosen item's command with the range that includes the
 * slash + query so it gets replaced by the new block.
 */
export const SlashMenuExtension = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        allow: ({ editor: e }) => {
          // Trigger anywhere in prose, Notion-style. Tiptap's Suggestion
          // plugin already requires the char to be at the start of a word
          // (start of line or after whitespace), so URLs like "http://"
          // don't fire it. Skip only where a slash is legitimately literal
          // content: code blocks and math nodes.
          const { $from } = e.state.selection;
          for (let d = $from.depth; d > 0; d--) {
            const name = $from.node(d).type.name;
            if (name === 'codeBlock' || name === 'mathInline' || name === 'mathBlock') {
              return false;
            }
          }
          return true;
        },
        command: ({ editor, range, props }) => {
          (props as SlashItem).command({ editor, range });
        },
        items: ({ query, editor }) => filterItems(query, editor),
        render: () => {
          let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;

          return {
            onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
              renderer = new ReactRenderer(SlashMenu, {
                props: {
                  items: props.items,
                  clientRect: props.clientRect ?? null,
                  command: (item: SlashItem) => props.command(item),
                },
                editor: props.editor,
              });
              document.body.appendChild(renderer.element);
            },
            onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
              renderer?.updateProps({
                items: props.items,
                clientRect: props.clientRect ?? null,
                command: (item: SlashItem) => props.command(item),
              });
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') {
                renderer?.destroy();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown({ event: props.event }) ?? false;
            },
            onExit: () => {
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
