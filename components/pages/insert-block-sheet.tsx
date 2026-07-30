'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Editor } from '@tiptap/react';
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Table as TableIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Bottom-sheet block picker, opened by the mobile editor toolbar's `+`
 * button. Each row switches the current line to that block type (or
 * inserts one for Table). Uses semantic tokens from docs/design-system.md
 * — bg-card / border-border / muted-foreground, no hard-coded colours.
 */
export function InsertBlockSheet({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: Editor;
}) {
  const close = () => onOpenChange(false);

  const rows: {
    icon: LucideIcon;
    label: string;
    shortcut: string;
    on: () => void;
  }[] = [
    {
      icon: Heading1,
      label: 'Heading 1',
      shortcut: '#',
      on: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      icon: Heading2,
      label: 'Heading 2',
      shortcut: '##',
      on: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: Heading3,
      label: 'Heading 3',
      shortcut: '###',
      on: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      icon: Heading4,
      label: 'Heading 4',
      shortcut: '####',
      on: () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
    },
    {
      icon: Heading5,
      label: 'Heading 5',
      shortcut: '#####',
      on: () => editor.chain().focus().toggleHeading({ level: 5 }).run(),
    },
    {
      icon: Heading6,
      label: 'Heading 6',
      shortcut: '######',
      on: () => editor.chain().focus().toggleHeading({ level: 6 }).run(),
    },
    {
      icon: List,
      label: 'Bulleted list',
      shortcut: '*',
      on: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      icon: ListOrdered,
      label: 'Numbered list',
      shortcut: '1.',
      on: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      icon: ListChecks,
      label: 'To-do list',
      shortcut: '☐',
      on: () => editor.chain().focus().toggleList('taskList', 'taskItem').run(),
    },
    {
      icon: Code,
      label: 'Code block',
      shortcut: '```',
      on: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      icon: TableIcon,
      label: 'Table',
      shortcut: '',
      on: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      icon: Quote,
      label: 'Blockquote',
      shortcut: '>',
      on: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0">
        <SheetHeader className="border-border/50 border-b px-6 py-4">
          <SheetTitle className="text-lg">Insert Block</SheetTitle>
        </SheetHeader>
        <ul className="divide-border/40 max-h-[70dvh] divide-y overflow-y-auto">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.label}>
                <button
                  type="button"
                  onClick={() => {
                    r.on();
                    close();
                  }}
                  className="hover:bg-muted/40 flex w-full items-center gap-3 px-6 py-3 text-left"
                >
                  <Icon className="text-muted-foreground h-4 w-4" />
                  <span className="flex-1 text-sm">{r.label}</span>
                  {r.shortcut && (
                    <span className="text-muted-foreground font-mono text-xs">{r.shortcut}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
