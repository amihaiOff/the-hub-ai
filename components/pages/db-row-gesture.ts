/**
 * Pure helpers for the mobile database-row gesture model. Kept side-effect-free
 * so the tap / long-press / swipe decisions are unit-testable; the React row
 * wires these to touch events and state.
 *
 * Gesture model (mobile only):
 *  - quick tap on a cell        → edit that cell inline (handled by the cell)
 *  - long-press anywhere        → open the row's entry card
 *  - swipe right at the left edge→ reveal a red delete button (tap it to delete)
 *
 * The swipe only engages when the horizontally-scrollable table is already
 * scrolled fully left, so a right-swipe that would otherwise scroll the table
 * is free to reveal the delete affordance instead.
 */

/** How far the row slides to fully reveal the delete button (px). */
export const SWIPE_REVEAL_PX = 76;
/** Drag distance past which the row stays open on release (px). */
export const SWIPE_OPEN_THRESHOLD = 40;
/** Movement under this (px) still counts as a stationary press/tap. */
export const AXIS_SLOP_PX = 8;
/** Press duration (ms) that promotes a stationary hold to a long-press. */
export const LONG_PRESS_MS = 500;

export type MoveAxis = 'horizontal' | 'vertical' | 'none';

/** Dominant axis of a move, or 'none' while still within the slop radius. */
export function moveAxis(dx: number, dy: number, slop: number = AXIS_SLOP_PX): MoveAxis {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return 'none';
  return Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
}

/**
 * Should a move engage the delete-reveal swipe (vs. letting the browser scroll
 * / the page scroll vertically)? Only when the table is scrolled fully left and
 * the move is a rightward horizontal drag.
 */
export function shouldEngageDeleteSwipe(dx: number, dy: number, atLeftEdge: boolean): boolean {
  return atLeftEdge && dx > 0 && moveAxis(dx, dy) === 'horizontal';
}

/** Clamp a drag delta to the visible reveal range [0, max]. */
export function clampReveal(dx: number, max: number = SWIPE_REVEAL_PX): number {
  return Math.max(0, Math.min(dx, max));
}

/** After release, does the row stay open (revealed) or snap closed? */
export function resolveSwipeEnd(dx: number, threshold: number = SWIPE_OPEN_THRESHOLD): boolean {
  return clampReveal(dx) >= threshold;
}

/** A press that never moved beyond the slop radius is a candidate tap/long-press. */
export function isStationary(dx: number, dy: number, slop: number = AXIS_SLOP_PX): boolean {
  return moveAxis(dx, dy, slop) === 'none';
}
