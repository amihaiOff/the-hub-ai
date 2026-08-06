'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';
import { floatingControlBottom } from './undo-redo-bar';
import { useKeyboardInset } from '@/lib/hooks/use-keyboard-inset';

interface TocEntry {
  pos: number;
  level: number;
  text: string;
}

/**
 * Table-of-contents pill anchored to the bottom-left of the areas page.
 *
 * Desktop: hover the pill to open the popup; move to it to keep it
 *   alive; mouse-leave (of both pill + popup) closes after a short delay.
 * Mobile: tap the pill to toggle the popup; tap outside to close.
 *
 * The popup lists every heading (levels 1–3) with progressive indent per
 * level. Clicking a row smooth-scrolls the editor viewport to that
 * heading's DOM node. A short scale/fade animation grows the popup out
 * of the pill (origin: bottom-left).
 */
export function PageTocButton({
  editor,
  hasBottomTabBar = false,
}: {
  editor: Editor | null;
  hasBottomTabBar?: boolean;
}) {
  const inset = useKeyboardInset();
  const [hoverOpen, setHoverOpen] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [entries, setEntries] = useState<TocEntry[]>([]);

  const collectHeadings = useCallback(() => {
    if (!editor) return [] as TocEntry[];
    const out: TocEntry[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const level = Number(node.attrs.level ?? 1);
        // Only levels 1–3 (CollapsibleHeading is configured for those).
        if (level > 3) return true;
        const text = node.textContent.trim();
        if (text) out.push({ pos, level, text });
        return false; // don't descend into heading text
      }
      return true;
    });
    return out;
  }, [editor]);

  // Refresh headings whenever the doc changes (and on mount). Debounced by
  // React's own batching; the update-heavy typing cadence still stays cheap.
  useEffect(() => {
    if (!editor) return;
    const refresh = () => setEntries(collectHeadings());
    refresh();
    editor.on('update', refresh);
    return () => {
      editor.off('update', refresh);
    };
  }, [editor, collectHeadings]);

  const open = hoverOpen || tapOpen;

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setHoverOpen(false), 180);
  };

  // Close the tap-driven popup when clicking outside on mobile.
  useEffect(() => {
    if (!tapOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest('[data-page-toc]')) setTapOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [tapOpen]);

  const scrollToPos = (pos: number) => {
    if (!editor) return;
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (dom && 'scrollIntoView' in dom) {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTapOpen(false);
    setHoverOpen(false);
  };

  const bottom = useMemo(
    () => floatingControlBottom(hasBottomTabBar, inset),
    [hasBottomTabBar, inset]
  );

  if (!editor) return null;

  // Portal to <body> so the fixed positioning resolves against the
  // viewport and never sits under a transformed editor ancestor.
  return createPortal(
    <div
      data-page-toc=""
      className="pointer-events-none fixed left-4 z-40 lg:left-[17rem]"
      // A hair above the tab bar / keyboard, tucked to the left. Clears
      // the desktop sidebar with `lg:left-[17rem]` (64 + 1rem gutter).
      style={{ bottom: `calc(${bottom} + 0.5rem)` }}
    >
      <div className="pointer-events-auto relative">
        <button
          type="button"
          aria-label={open ? 'Close table of contents' : 'Open table of contents'}
          title="Table of contents"
          onPointerEnter={() => {
            cancelHide();
            setHoverOpen(true);
          }}
          onPointerLeave={scheduleHide}
          onClick={() => setTapOpen((v) => !v)}
          className={cn(
            'border-border/60 bg-card/95 text-muted-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors',
            open && 'text-foreground'
          )}
        >
          <ListTree className="h-4 w-4" />
        </button>

        {/* Popup — animates scale+opacity from bottom-left so it grows out
            of the pill. `pointer-events-none` while closed keeps stray
            interactions off it. */}
        <div
          onPointerEnter={cancelHide}
          onPointerLeave={scheduleHide}
          className={cn(
            'border-border/60 bg-card/98 absolute bottom-11 left-0 max-w-[26rem] min-w-64 overflow-y-auto rounded-2xl border shadow-xl backdrop-blur',
            'origin-bottom-left transition-[transform,opacity] duration-150 ease-out',
            open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
          )}
          style={{ maxHeight: '70vh' }}
          role="menu"
        >
          <div className="border-border/40 flex items-center gap-2 border-b px-3 py-2">
            <ListTree className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Contents
            </span>
          </div>
          {entries.length === 0 ? (
            <p className="text-muted-foreground px-3 py-3 text-xs">
              No headings yet — add one to build a table of contents.
            </p>
          ) : (
            <ul className="max-h-[calc(70vh-40px)] overflow-y-auto py-1">
              {entries.map((e, i) => (
                <li key={`${e.pos}-${i}`}>
                  <button
                    type="button"
                    onClick={() => scrollToPos(e.pos)}
                    className="hover:bg-muted/70 text-foreground block w-full truncate px-3 py-1.5 text-left text-sm transition-colors"
                    style={{ paddingLeft: `${0.75 + (e.level - 1) * 0.9}rem` }}
                  >
                    {e.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
