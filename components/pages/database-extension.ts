import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DatabaseBlockView } from './database-block';

/**
 * A Notion-like "database" block: a structured table with typed columns
 * (text / number / date / select / checkbox), click-header sorting, and
 * row/column add/delete controls. Everything is stored as JSON on two
 * attributes so a saved page round-trips faithfully through the Tiptap
 * document JSON, no external persistence needed.
 */

export type DatabaseColumnType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox';

export interface DatabaseColumn {
  /** Stable per-column id. Persisted so referencing the column by name isn't required. */
  id: string;
  name: string;
  type: DatabaseColumnType;
  /** Present for `select` and `multiselect` columns. Each option carries a stable id + label + optional color key (see SELECT_COLORS in database-block). */
  options?: { id: string; label: string; color?: string }[];
  /**
   * Persisted column width in px (Table view), set by dragging the header
   * border. Optional — a missing width falls back to a per-type default
   * (see `columnWidth` in `lib/pages/db-view.ts`). Shared, so both household
   * members see the same layout.
   */
  width?: number;
}

/**
 * A cell value. `string[]` is the `multiselect` shape — an array of the
 * selected options' ids (empty array = nothing selected). Every other column
 * type stores a scalar.
 */
export type DatabaseCellValue = string | number | boolean | string[] | null;

export interface DatabaseRow {
  id: string;
  /** Cells keyed by column id. Missing keys render as empty. */
  cells: Record<string, DatabaseCellValue>;
  /**
   * Optional rich-text body for the row's detail view (a Tiptap JSON doc),
   * edited in the entry side panel. `undefined` on legacy rows → empty body.
   * Round-trips inside the block's `data-rows` JSON like the rest of the row.
   */
  body?: unknown;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseBlock: {
      /** Insert an empty 3-column database at the current selection. */
      insertDatabase: () => ReturnType;
    };
  }
}

export function newId(prefix: string): string {
  // Simple non-cryptographic id — enough for local disambiguation.
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultColumns(): DatabaseColumn[] {
  return [
    { id: newId('col'), name: 'Name', type: 'text' },
    {
      id: newId('col'),
      name: 'Status',
      type: 'select',
      options: [
        { id: newId('opt'), label: 'Todo', color: 'slate' },
        { id: newId('opt'), label: 'Doing', color: 'blue' },
        { id: newId('opt'), label: 'Done', color: 'emerald' },
      ],
    },
    { id: newId('col'), name: 'Due', type: 'date' },
  ];
}

function defaultRows(cols: DatabaseColumn[]): DatabaseRow[] {
  const blank = () => Object.fromEntries(cols.map((c) => [c.id, null]));
  return [
    { id: newId('row'), cells: blank() },
    { id: newId('row'), cells: blank() },
    { id: newId('row'), cells: blank() },
  ];
}

export const DatabaseBlock = Node.create({
  name: 'databaseBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      // Stable per-block id. Persisted so per-viewer view state (e.g. the
      // ephemeral column filters, which live in localStorage keyed by this id)
      // can be re-associated with the block across reloads. Older blocks have
      // no id; the NodeView backfills one on first mount.
      id: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-block-id'),
        renderHTML: (attrs) => (attrs.id ? { 'data-block-id': attrs.id } : {}),
      },
      // Optional display title shown above the grid. Persisted so it round-trips
      // in the document JSON.
      title: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-title'),
        renderHTML: (attrs) => (attrs.title ? { 'data-title': attrs.title } : {}),
      },
      columns: {
        default: null as DatabaseColumn[] | null,
        parseHTML: (el) => tryParseJson(el.getAttribute('data-columns')),
        renderHTML: (attrs) => ({ 'data-columns': JSON.stringify(attrs.columns ?? []) }),
      },
      rows: {
        default: null as DatabaseRow[] | null,
        parseHTML: (el) => tryParseJson(el.getAttribute('data-rows')),
        renderHTML: (attrs) => ({ 'data-rows': JSON.stringify(attrs.rows ?? []) }),
      },
      // Shared, per-block view configuration (current view, density, group-by,
      // kanban column, sort, filters, per-view hidden columns, card options).
      // A single JSON attribute keeps the HTML tidy and stays backward
      // compatible: legacy blocks have no `data-view-config`, so this parses to
      // null and `resolveViewConfig` (lib/pages/db-view.ts) fills in defaults.
      // Storing it here (not localStorage) means both household members see the
      // same configured view. Does NOT touch the columns/rows shape, so the
      // agent backlog reader is unaffected.
      viewConfig: {
        default: null as unknown,
        parseHTML: (el) => tryParseJson(el.getAttribute('data-view-config')),
        renderHTML: (attrs) =>
          attrs.viewConfig ? { 'data-view-config': JSON.stringify(attrs.viewConfig) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'database-block' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockView, {
      // This atom is `selectable`/`draggable` so the mobile block-drag handle
      // (rendered outside this node view, in page-body-editor.tsx) can select
      // and reorder the whole block. But without this guard, ProseMirror's
      // own mousedown/mouseup handling (selectClickedLeaf's NodeSelection +
      // a mid-gesture `draggable` toggle on the atom's DOM node) runs for
      // EVERY tap inside the block too — including on its own interactive
      // controls (e.g. the mobile Tools button) — and WebKit's touch-to-click
      // synthesis can turn that into a double-fire independent of, and in
      // addition to, the plain contentEditable-nested-button issue. Skipping
      // ProseMirror's handling when the tap lands on a real control lets the
      // control's own React onClick behave like a normal button while still
      // allowing whole-block selection/drag from the block's non-interactive
      // chrome.
      stopEvent: ({ event }) => {
        const target = event.target;
        // `Element`, not `HTMLElement` — an icon-only button's tap target is
        // often the inner <svg>/<path>, which is an SVGElement (a sibling of
        // HTMLElement under Element, not a subclass), so an HTMLElement check
        // here would let those taps fall through unguarded.
        if (!(target instanceof Element)) return false;
        return !!target.closest(
          'button, input, textarea, select, [role="button"], [contenteditable="true"]'
        );
      },
    });
  },

  addCommands() {
    return {
      insertDatabase:
        () =>
        ({ chain }) => {
          const cols = defaultColumns();
          const rows = defaultRows(cols);
          return chain()
            .insertContent({
              type: this.name,
              attrs: { columns: cols, rows: rows },
            })
            .run();
        },
    };
  },
});

function tryParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function makeColumn(name: string, type: DatabaseColumnType): DatabaseColumn {
  const col: DatabaseColumn = { id: newId('col'), name, type };
  if (type === 'select' || type === 'multiselect') col.options = [];
  return col;
}

/** Empty (unset) value for a column of the given type. */
export function emptyCellValue(type: DatabaseColumnType): DatabaseCellValue {
  if (type === 'checkbox') return false;
  if (type === 'multiselect') return [];
  return null;
}

export function makeRow(cols: DatabaseColumn[]): DatabaseRow {
  return {
    id: newId('row'),
    cells: Object.fromEntries(cols.map((c) => [c.id, emptyCellValue(c.type)])),
  };
}

export function makeSelectOption(label: string, color?: string) {
  return { id: newId('opt'), label, color };
}
