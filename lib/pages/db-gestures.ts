/**
 * Single source of truth for the Areas database block's touch/pointer gesture
 * timings. Centralising these keeps the long-press (open row / column sheet) and
 * the dnd-kit drag activation constraints consistent across the Table, Cards,
 * Kanban, and column-header interactions — tune once, apply everywhere.
 */
export const GESTURE = {
  /** Hold-to-open a row's page (cards) / column sheet (header). */
  longPressMs: 450,
  /** Px of finger travel that still counts as a press (beyond it = scroll). */
  longPressMoveTolerance: 8,
  /** Hold before a dnd-kit TouchSensor drag starts (lets a scroll read first). */
  dragTouchDelayMs: 220,
  /** Px tolerance during that hold before the gesture is treated as a scroll. */
  dragTouchTolerancePx: 8,
  /** Px a mouse must move before a drag starts. */
  dragMouseDistancePx: 6,
} as const;
