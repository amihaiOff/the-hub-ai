'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  IndentDecrease,
  IndentIncrease,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKeyboardInset } from '@/lib/hooks/use-keyboard-inset';
import { floatingControlBottom } from './undo-redo-bar';
import { canOutdentWithinList } from './list-indent-controls';
import { InsertBlockSheet } from './insert-block-sheet';

/**
 * The floating mobile editor toolbar. Shown only while the editor is focused
 * (i.e. the user is editing a block) and pinned above the on-screen keyboard.
 * Replaces the older UndoRedoBar + ListIndentControls on mobile — all block
 * controls consolidate into one row here.
 *
 * Buttons, left → right:
 *   +           → open Insert Block sheet
 *   {type} ⌄    → active block type, also opens the sheet (switch type)
 *   undo / redo → history navigation
 *   delete      → remove the current top-level block
 *   duplicate   → copy the current top-level block below itself
 *   indent / outdent → only rendered when the cursor is inside a list
 *
 * Uses semantic tokens from docs/design-system.md — no hard-coded hex.
 */
export function MobileEditorToolbar({
  editor,
  hasBottomTabBar = false,
}: {
  editor: Editor | null;
  hasBottomTabBar?: boolean;
}) {
  const inset = useKeyboardInset();
  const [focused, setFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Default to collapsed so opening an Areas page doesn't blast the toolbar
  // across the bottom of the screen — user taps the chevron to expand it
  // when they actually want the block controls.
  const [collapsed, setCollapsed] = useState(true);
  // Tiptap history and node-position state only mutates via transactions —
  // re-render the toolbar on every one so labels + enabled state stay live.
  const [, force] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const rerender = () => force((n) => n + 1);
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    editor.on('update', rerender);
    editor.on('transaction', rerender);
    editor.on('selectionUpdate', rerender);
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    // Sync current focus state without a synchronous setState-in-effect
    // (the eslint rule against cascading renders). The focus/blur events
    // above cover every subsequent change.
    if (editor.isFocused) queueMicrotask(() => setFocused(true));
    return () => {
      editor.off('update', rerender);
      editor.off('transaction', rerender);
      editor.off('selectionUpdate', rerender);
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  if (!editor) return null;
  // Only visible when actively editing. The sheet stays open independently
  // once triggered — closing the sheet returns focus to the editor.
  if (!focused && !sheetOpen) return null;

  const label = currentBlockLabel(editor);
  const inList =
    editor.isActive('listItem') ||
    editor.isActive('taskItem') ||
    editor.isActive('bulletList') ||
    editor.isActive('orderedList');
  const canOutdent = canOutdentWithinList(editor);
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  const openSheet = () => setSheetOpen(true);
  const deleteBlock = () => {
    const pos = topLevelBlockStart(editor);
    if (pos == null) return;
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };
  const duplicateBlock = () => {
    const info = topLevelBlock(editor);
    if (!info) return;
    editor
      .chain()
      .focus()
      .insertContentAt(info.start + info.size, info.node.toJSON())
      .run();
  };
  const outdent = () => {
    editor.chain().focus().liftListItem('listItem').run() ||
      editor.chain().focus().liftListItem('taskItem').run();
  };
  const indent = () => {
    editor.chain().focus().sinkListItem('listItem').run() ||
      editor.chain().focus().sinkListItem('taskItem').run();
  };
  return (
    <>
      {createPortal(
        <div
          className={cn(
            'pointer-events-none fixed inset-x-0 z-40 flex px-2 lg:hidden',
            // Centered when expanded so the row breathes evenly; anchored
            // right when collapsed so it visually parks against the edge.
            collapsed ? 'justify-end' : 'justify-center'
          )}
          // Small extra gap so the toolbar isn't flush with the tab bar.
          style={{ bottom: `calc(${floatingControlBottom(hasBottomTabBar, inset)} + 0.5rem)` }}
          aria-label="Block editor toolbar"
        >
          <div className="border-border/60 bg-card/95 pointer-events-auto flex max-w-full items-center rounded-2xl border py-1 pr-1 shadow-lg backdrop-blur">
            {/* Collapsible section — width and padding animate to 0 so the
                whole bar shrinks horizontally into the chevron. Inner row
                stays laid out; overflow-hidden clips it as the wrapper
                collapses. Fast (150ms) per user request. */}
            <div
              className={cn(
                'flex items-center gap-0.5 overflow-hidden transition-[max-width,padding,opacity] duration-150 ease-out',
                collapsed ? 'max-w-0 pl-0 opacity-0' : 'max-w-[95vw] pl-1 opacity-100'
              )}
              aria-hidden={collapsed}
            >
              <IconButton label="Insert block" onClick={openSheet}>
                <Plus className="h-5 w-5" />
              </IconButton>
              <button
                type="button"
                onClick={openSheet}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Change block type"
                className="text-foreground hover:bg-muted/60 flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-sm"
              >
                <span className="truncate">{label}</span>
                <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
              </button>
              <Divider />
              <IconButton
                label="Undo"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!canUndo}
              >
                <Undo2 className="h-5 w-5" />
              </IconButton>
              <IconButton
                label="Redo"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!canRedo}
              >
                <Redo2 className="h-5 w-5" />
              </IconButton>
              <Divider />
              <IconButton label="Delete block" onClick={deleteBlock}>
                <Trash2 className="h-5 w-5" />
              </IconButton>
              <IconButton label="Duplicate block" onClick={duplicateBlock}>
                <Copy className="h-5 w-5" />
              </IconButton>
              {inList && (
                <>
                  <IconButton label="Outdent" onClick={outdent} disabled={!canOutdent}>
                    <IndentDecrease className="h-5 w-5" />
                  </IconButton>
                  <IconButton label="Indent" onClick={indent}>
                    <IndentIncrease className="h-5 w-5" />
                  </IconButton>
                </>
              )}
            </div>
            <IconButton
              label={collapsed ? 'Expand toolbar' : 'Collapse toolbar'}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? (
                <ChevronLeft className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </IconButton>
          </div>
        </div>,
        document.body
      )}
      <InsertBlockSheet open={sheetOpen} onOpenChange={setSheetOpen} editor={editor} />
    </>
  );
}

function IconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      // Mousedown-prevent stops the editor from blurring the moment a
      // toolbar button is tapped — otherwise the toolbar disappears mid-tap.
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
        disabled
          ? 'text-muted-foreground/40 cursor-not-allowed'
          : 'text-foreground hover:bg-muted/60'
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="bg-border/70 mx-0.5 h-5 w-px shrink-0" aria-hidden />;
}

/** Human-readable label for the block containing the cursor. */
function currentBlockLabel(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
  if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
  if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
  if (editor.isActive('heading', { level: 4 })) return 'Heading 4';
  if (editor.isActive('heading', { level: 5 })) return 'Heading 5';
  if (editor.isActive('heading', { level: 6 })) return 'Heading 6';
  if (editor.isActive('taskList') || editor.isActive('taskItem')) return 'To-do list';
  if (editor.isActive('bulletList')) return 'Bulleted list';
  if (editor.isActive('orderedList')) return 'Numbered list';
  if (editor.isActive('codeBlock')) return 'Code block';
  if (editor.isActive('blockquote')) return 'Blockquote';
  if (editor.isActive('table')) return 'Table';
  return 'Paragraph';
}

/** Start position of the top-level block that contains the current selection. */
function topLevelBlockStart(editor: Editor): number | null {
  const { $from } = editor.state.selection;
  if ($from.depth < 1) return null;
  return $from.before(1);
}

function topLevelBlock(
  editor: Editor
): { node: import('prosemirror-model').Node; start: number; size: number } | null {
  const start = topLevelBlockStart(editor);
  if (start == null) return null;
  const node = editor.state.doc.nodeAt(start);
  if (!node) return null;
  return { node, start, size: node.nodeSize };
}
