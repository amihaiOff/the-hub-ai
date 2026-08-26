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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'database-block' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlockView);
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
