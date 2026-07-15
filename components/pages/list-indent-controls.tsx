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
 * How many list items are stacked above the cursor. A top-level item has a
 * depth of 1; a nested item has ≥ 2. Outdenting a depth-1 item would lift it
 * OUT of the list entirely (into a paragraph) — which we don't want — so we
 * only allow outdent when depth ≥ 2. Exported so the keyboard handler in the
 * editor shares exactly the same rule.
 */
export function listItemDepth(editor: Editor): number {
  const { $from } = editor.state.selection;
  let count = 0;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (name === 'listItem' || name === 'taskItem') count++;
  }
  return count;
}

/** True when outdenting would keep the item inside a list (nested ≥ 2). */
export function canOutdentWithinList(editor: Editor): boolean {
  return listItemDepth(editor) >= 2;
}

/**
 * Floating outdent/indent controls, shown at the bottom of the screen only
 * while the cursor is inside a list. This lets the user indent/outdent list
 * items in place — no scrolling back up to the editor toolbar — and it lifts
 * above the on-screen keyboard on mobile so it's never obscured.
 */
export function ListIndentControls({ editor }: { editor: Editor }) {
  const [inList, setInList] = useState(() => isInList(editor));
  const [canOutdent, setCanOutdent] = useState(() => canOutdentWithinList(editor));
  const inset = useKeyboardInset();

  useEffect(() => {
    const update = () => {
      setInList(isInList(editor));
      setCanOutdent(canOutdentWithinList(editor));
    };
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
  // Only lift when the item is nested inside another list item — never lift a
  // top-level item out of the list into a plain paragraph.
  const outdent = () => {
    if (!canOutdentWithinList(editor)) return;
    const lifted = editor.chain().focus().liftListItem('listItem').run();
    if (!lifted) editor.chain().focus().liftListItem('taskItem').run();
  };

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
        disabled={!canOutdent}
        aria-label="Outdent list item"
        title={canOutdent ? 'Outdent' : 'Already at the top level'}
        className="hover:bg-muted text-muted-foreground hover:text-foreground flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
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
