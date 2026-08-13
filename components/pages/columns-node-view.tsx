'use client';

import { useRef, useState } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { DEFAULT_LEFT_RATIO, MAX_LEFT_RATIO, MIN_LEFT_RATIO } from './columns-extension';

/**
 * Two-column layout React NodeView. Renders the column pair via
 * NodeViewContent and overlays a draggable divider between them.
 *
 * Drag behaviour: pointerdown captures the wrapper's rect and pointer.
 * pointermove updates a local `dragRatio` (fast, no ProseMirror
 * roundtrip) that CSS reads via `--left-ratio`. pointerup commits the
 * final ratio to the node's `leftRatio` attribute — one undo step per
 * resize instead of dozens.
 *
 * Divider is desktop-only (`hidden sm:block`) since the layout stacks
 * vertically on mobile — there's nothing to resize horizontally.
 */
export function ColumnBlockView(props: NodeViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const savedRatio =
    typeof props.node.attrs.leftRatio === 'number'
      ? props.node.attrs.leftRatio
      : DEFAULT_LEFT_RATIO;
  // While dragging we track the live ratio locally so CSS updates
  // smoothly without a ProseMirror transaction per pixel.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const ratio = dragRatio ?? savedRatio;

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!props.editor.isEditable) return;
    e.preventDefault();
    const wrapper = wrapRef.current;
    if (!wrapper) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const rect = wrapper.getBoundingClientRect();
    let latest = savedRatio;

    const onMove = (ev: PointerEvent) => {
      if (rect.width <= 0) return;
      const raw = (ev.clientX - rect.left) / rect.width;
      const clamped = Math.min(MAX_LEFT_RATIO, Math.max(MIN_LEFT_RATIO, raw));
      latest = clamped;
      setDragRatio(clamped);
    };
    const onUp = () => {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setDragRatio(null);
      // Commit only if the ratio actually moved — pointerup on a pure
      // click is a no-op so undo history doesn't get a phantom step.
      if (Math.abs(latest - savedRatio) > 0.001) {
        props.updateAttributes({ leftRatio: latest });
      }
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  return (
    <NodeViewWrapper
      ref={wrapRef}
      className="page-columns"
      data-type="column-block"
      style={{ ['--left-ratio' as string]: String(ratio) }}
    >
      <NodeViewContent className="page-columns-content" as="div" />
      {props.editor.isEditable && (
        <button
          type="button"
          aria-label="Resize columns"
          title="Drag to resize"
          onPointerDown={startDrag}
          // contentEditable="false" so ProseMirror doesn't treat the
          // handle as text content — otherwise typing near it can push
          // characters into a weird position.
          contentEditable={false}
          className="page-column-resize-handle"
          style={{ left: `calc(${ratio * 100}% - 6px)` }}
        />
      )}
    </NodeViewWrapper>
  );
}
