/**
 * Shared props for the long-press multi-select behaviour used by the card
 * views (list + kanban). Selection state itself lives in TasksClient.
 */
export interface SelectionProps {
  /** True while the user is picking multiple tasks. */
  selectionMode: boolean;
  /** IDs of the currently-selected tasks. */
  selectedIds: Set<string>;
  /** Long-press a card: enter selection mode with this task selected. */
  onEnterSelection: (id: string) => void;
  /** Tap a card while in selection mode: add/remove it from the selection. */
  onToggleSelection: (id: string) => void;
}
