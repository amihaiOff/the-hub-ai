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

export type DatabaseColumnType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

export interface DatabaseColumn {
  /** Stable per-column id. Persisted so referencing the column by name isn't required. */
  id: string;
  name: string;
  type: DatabaseColumnType;
  /** Present for `select` columns. Each option carries a stable id + label. */
  options?: { id: string; label: string }[];
}

export type DatabaseCellValue = string | number | boolean | null;

export interface DatabaseRow {
  id: string;
  /** Cells keyed by column id. Missing keys render as empty. */
  cells: Record<string, DatabaseCellValue>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    databaseBlock: {
      /** Insert an empty 3-column database at the current selection. */
      insertDatabase: () => ReturnType;
    };
  }
}

function newId(prefix: string): string {
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
        { id: newId('opt'), label: 'Todo' },
        { id: newId('opt'), label: 'Doing' },
        { id: newId('opt'), label: 'Done' },
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
  if (type === 'select') col.options = [];
  return col;
}

export function makeRow(cols: DatabaseColumn[]): DatabaseRow {
  return {
    id: newId('row'),
    cells: Object.fromEntries(cols.map((c) => [c.id, c.type === 'checkbox' ? false : null])),
  };
}

export function makeSelectOption(label: string) {
  return { id: newId('opt'), label };
}
