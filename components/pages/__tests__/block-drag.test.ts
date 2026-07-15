/**
 * @jest-environment jsdom
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  buildMoveTransaction,
  computeDropTarget,
  topLevelPos,
  type DropBlock,
} from '../block-drag';

function makeEditor(content: string): Editor {
  return new Editor({ element: document.createElement('div'), extensions: [StarterKit], content });
}

/** Top-level child positions (boundary before each direct child of doc). */
function childPositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.forEach((_node, offset) => positions.push(offset));
  return positions;
}

describe('computeDropTarget', () => {
  const blocks: DropBlock[] = [
    { pos: 0, rect: { top: 0, height: 20, bottom: 20 } },
    { pos: 5, rect: { top: 20, height: 20, bottom: 40 } },
    { pos: 10, rect: { top: 40, height: 20, bottom: 60 } },
  ];

  it('drops before the first block when the pointer is above its midpoint', () => {
    expect(computeDropTarget(blocks, 100, 5)).toEqual({ insertPos: 0, indicatorY: 0 });
  });

  it('drops before a middle block when the pointer is in its top half', () => {
    // y=25 is past block0 (mid 10) but in block1's top half (mid 30).
    expect(computeDropTarget(blocks, 100, 25)).toEqual({ insertPos: 5, indicatorY: 20 });
  });

  it('appends at the end when the pointer is below every midpoint', () => {
    // y=55 is past the last block's midpoint (50) → append at endPos.
    expect(computeDropTarget(blocks, 100, 55)).toEqual({ insertPos: 100, indicatorY: 60 });
  });

  it('handles an empty block list by appending at endPos', () => {
    expect(computeDropTarget([], 42, 10)).toEqual({ insertPos: 42, indicatorY: 0 });
  });

  it('does not drop before a block when the pointer is exactly on its midpoint', () => {
    // The comparison is strict (`y < mid`), so y exactly at block0's midpoint
    // (10) skips block0 and lands before the next block whose midpoint is below.
    expect(computeDropTarget(blocks, 100, 10)).toEqual({ insertPos: 5, indicatorY: 20 });
  });
});

describe('buildMoveTransaction', () => {
  it('moves the first block to the end', () => {
    const editor = makeEditor('<p>A</p><p>B</p><p>C</p>');
    const [firstPos] = childPositions(editor);
    const endPos = editor.state.doc.content.size;
    const tr = buildMoveTransaction(editor.state, firstPos, endPos);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);
    expect(editor.state.doc.textContent).toBe('BCA');
    editor.destroy();
  });

  it('moves a later block up to the front', () => {
    const editor = makeEditor('<p>A</p><p>B</p><p>C</p>');
    const positions = childPositions(editor);
    // Move the third block (C) to before the first block.
    const tr = buildMoveTransaction(editor.state, positions[2], positions[0]);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);
    expect(editor.state.doc.textContent).toBe('CAB');
    editor.destroy();
  });

  it('is a no-op when dropping a block onto itself (before)', () => {
    const editor = makeEditor('<p>A</p><p>B</p>');
    const [firstPos] = childPositions(editor);
    expect(buildMoveTransaction(editor.state, firstPos, firstPos)).toBeNull();
    editor.destroy();
  });

  it('is a no-op when dropping a block in the gap immediately after itself', () => {
    const editor = makeEditor('<p>A</p><p>B</p>');
    const positions = childPositions(editor);
    // The gap after block A is exactly block B's position.
    expect(buildMoveTransaction(editor.state, positions[0], positions[1])).toBeNull();
    editor.destroy();
  });

  it('returns null when the source position has no node (end of doc)', () => {
    const editor = makeEditor('<p>A</p><p>B</p>');
    // nodeAt(content.size) is null — there is no node at the very end.
    const endPos = editor.state.doc.content.size;
    expect(buildMoveTransaction(editor.state, endPos, 0)).toBeNull();
    editor.destroy();
  });

  it('moves the first block into the middle', () => {
    const editor = makeEditor('<p>A</p><p>B</p><p>C</p>');
    const positions = childPositions(editor);
    // Move block A to before block C (the middle gap) → B, A, C.
    const tr = buildMoveTransaction(editor.state, positions[0], positions[2]);
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);
    expect(editor.state.doc.textContent).toBe('BAC');
    editor.destroy();
  });
});

describe('topLevelPos', () => {
  it('resolves a cursor in a top-level paragraph to that block boundary', () => {
    const editor = makeEditor('<p>hello</p>');
    editor.commands.setTextSelection(2);
    expect(topLevelPos(editor.state)).toBe(0);
    editor.destroy();
  });

  it('resolves a cursor inside a nested list item to the top-level list', () => {
    const editor = makeEditor('<ul><li><p>parent</p><ul><li><p>child</p></li></ul></li></ul>');
    let target = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'child') target = pos + 1;
      return true;
    });
    editor.commands.setTextSelection(target);
    // The top-level block is the outer bulletList, which starts at position 0.
    expect(topLevelPos(editor.state)).toBe(0);
    editor.destroy();
  });
});
