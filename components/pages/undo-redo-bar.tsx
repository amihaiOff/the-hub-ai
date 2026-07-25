'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Undo2, Redo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  if (!editor) return null;
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return (
    <div
      className={cn(
        'safe-px pointer-events-none fixed left-0 z-40 pl-3 lg:hidden',
        // When a bottom tab bar is present, sit above it; otherwise flush to the
        // bottom (clearing the iOS home indicator via safe-pb).
        liftAboveTabBar ? 'bottom-16' : 'safe-pb bottom-0 pb-3'
      )}
      aria-label="Undo and redo"
    >
      <div className="border-border/60 bg-card/90 pointer-events-auto flex items-center gap-0.5 rounded-xl border p-0.5 shadow-lg backdrop-blur-md">
        <ArrowButton
          label="Undo"
          disabled={!canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ArrowButton>
        <ArrowButton
          label="Redo"
          disabled={!canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ArrowButton>
      </div>
    </div>
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
