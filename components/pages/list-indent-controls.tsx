'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { IndentDecrease, IndentIncrease } from 'lucide-react';
import { useKeyboardInset } from '@/lib/hooks/use-keyboard-inset';

function isInList(editor: Editor): boolean {
  return (
    editor.isActive('listItem') ||
    editor.isActive('taskItem') ||
    editor.isActive('bulletList') ||
    editor.isActive('orderedList')
  );
}

/**
 * Floating outdent/indent controls, shown at the bottom of the screen only
 * while the cursor is inside a list. This lets the user indent/outdent list
 * items in place — no scrolling back up to the editor toolbar — and it lifts
 * above the on-screen keyboard on mobile so it's never obscured.
 */
export function ListIndentControls({ editor }: { editor: Editor }) {
  const [inList, setInList] = useState(() => isInList(editor));
  const inset = useKeyboardInset();

  useEffect(() => {
    const update = () => setInList(isInList(editor));
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  if (!inList) return null;

  const indent = () =>
    editor.chain().focus().sinkListItem('listItem').run() ||
    editor.chain().focus().sinkListItem('taskItem').run();
  const outdent = () =>
    editor.chain().focus().liftListItem('listItem').run() ||
    editor.chain().focus().liftListItem('taskItem').run();

  return (
    <div
      className="border-border/60 bg-background/95 fixed right-4 z-40 flex items-center gap-1 rounded-full border p-1 shadow-lg backdrop-blur"
      style={{ bottom: `calc(1rem + env(safe-area-inset-bottom) + ${inset}px)` }}
    >
      <button
        type="button"
        // onPointerDown + preventDefault keeps the editor selection (and mobile
        // keyboard) from dropping when the button is tapped.
        onPointerDown={(e) => e.preventDefault()}
        onClick={outdent}
        aria-label="Outdent list item"
        title="Outdent"
        className="hover:bg-muted text-muted-foreground hover:text-foreground flex h-10 w-10 items-center justify-center rounded-full transition-colors"
      >
        <IndentDecrease className="h-5 w-5" />
      </button>
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onClick={indent}
        aria-label="Indent list item"
        title="Indent"
        className="hover:bg-muted text-muted-foreground hover:text-foreground flex h-10 w-10 items-center justify-center rounded-full transition-colors"
      >
        <IndentIncrease className="h-5 w-5" />
      </button>
    </div>
  );
}
