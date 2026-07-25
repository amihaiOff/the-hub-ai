'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Undo2, Redo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKeyboardInset } from '@/lib/hooks/use-keyboard-inset';

// Height of the Areas tab bar (its content + bottom clearance). The floating
// controls sit just above it, at the same level, so undo/redo (left) and the
// indent controls (right) read as one row across the bottom.
export const TAB_BAR_CLEARANCE = '3.5rem';

/**
 * Bottom offset for the floating editor controls (undo/redo + indent), shared
 * so they stay level with each other. Sits just above the tab bar when it's
 * shown, otherwise near the bottom edge (clearing the home indicator). Both
 * add the on-screen-keyboard inset so they ride above the keyboard.
 */
export function floatingControlBottom(hasTabBar: boolean, keyboardInset: number): string {
  const base = hasTabBar ? TAB_BAR_CLEARANCE : 'calc(0.75rem + env(safe-area-inset-bottom))';
  return `calc(${base} + ${keyboardInset}px)`;
}

/**
 * Mobile-only floating undo/redo bar. Sits at the bottom of the viewport
 * above the home-indicator inset, with two arrow icons (no words). The
 * desktop editor already has Ctrl/Cmd-Z and Ctrl/Cmd-Shift-Z bound via
 * Tiptap history, so this bar exists purely to give touch users the same
 * gesture without needing a physical keyboard.
 */
export function UndoRedoBar({
  editor,
  liftAboveTabBar = false,
}: {
  editor: Editor | null;
  liftAboveTabBar?: boolean;
}) {
  const inset = useKeyboardInset();
  // Tiptap's editor.can().undo() only re-evaluates on transactions — but
  // React doesn't rerender when Tiptap state changes unless we subscribe.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => force((n) => n + 1);
    editor.on('update', rerender);
    editor.on('transaction', rerender);
    return () => {
      editor.off('update', rerender);
      editor.off('transaction', rerender);
    };
  }, [editor]);

  // `editor` is only non-null after Tiptap initialises client-side, so we never
  // reach the portal during SSR — document.body is always defined here.
  if (!editor) return null;
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  // Portal to <body> so `position: fixed` resolves against the viewport rather
  // than a transformed ancestor in the editor subtree (which would drop the bar
  // to the content bottom instead of pinning it).
  return createPortal(
    <div
      className="pointer-events-none fixed left-0 z-40 lg:hidden"
      // Sit just above the tab bar (or near the bottom when there's none), and
      // above the on-screen keyboard when open — level with the indent controls
      // on the right so they read as one row.
      style={{ bottom: floatingControlBottom(liftAboveTabBar, inset) }}
      aria-label="Undo and redo"
    >
      {/* No background — just the two icons floating over the page. */}
      <div className="pointer-events-auto flex items-center gap-0.5">
        <ArrowButton
          label="Undo"
          disabled={!canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-5 w-5" />
        </ArrowButton>
        <ArrowButton
          label="Redo"
          disabled={!canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-5 w-5" />
        </ArrowButton>
      </div>
    </div>,
    document.body
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
        disabled
          ? 'text-muted-foreground/40 cursor-not-allowed'
          : 'text-foreground hover:bg-muted/60'
      )}
    >
      {children}
    </button>
  );
}
