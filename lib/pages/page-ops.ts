/**
 * The structured write vocabulary for Areas pages.
 *
 * A page's stored content is a Tiptap/ProseMirror document that nothing
 * validates on the way in (see `pageContentSchema`) — the editor owns its
 * shape. A malformed document is persisted happily and then fails to render,
 * which breaks that page in the app. So callers that aren't the editor never
 * hand us a document: they ask for one of a fixed set of edits and this module
 * builds the nodes. An invalid page is not expressible.
 *
 * Pure: no DB, no React, no Tiptap runtime. The route layer loads the document,
 * calls `applyOps`, and persists the result.
 */

import {
  emptyCellValue,
  type DatabaseCellValue,
  makeSelectOption,
  newId,
  type DatabaseColumn,
  type DatabaseColumnType,
  type DatabaseRow,
} from './db-schema';

const COLUMN_TYPES: DatabaseColumnType[] = [
  'text',
  'number',
  'date',
  'select',
  'multiselect',
  'checkbox',
];

export interface TiptapDoc {
  type: 'doc';
  content: DocNode[];
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
}

export type PageOp =
  | { op: 'appendParagraph'; text: string }
  | { op: 'appendHeading'; level: 1 | 2 | 3; text: string }
  | { op: 'appendBulletList'; items: string[] }
  | { op: 'addDatabaseBlock'; title?: string; columns: NewColumn[] }
  | { op: 'addRows'; blockId?: string; rows: Record<string, unknown>[] }
  | { op: 'setCells'; blockId?: string; rowId: string; values: Record<string, unknown> };

/** A column to create: a name, a type, and the choices for a choice column. */
export interface NewColumn {
  name: string;
  type: DatabaseColumnType;
  /** Option labels, for `select` / `multiselect` only. */
  options?: string[];
}

/** What one applied op produced — handles the caller needs to address it later. */
export interface OpOutcome {
  /** The new table's handle, when the op created one. */
  blockId?: string;
  /** The new rows' handles in the order given, when the op created rows. */
  rowIds?: string[];
}

export type ApplyResult =
  | { ok: true; doc: TiptapDoc; outcomes: OpOutcome[] }
  /** `opIndex` is absent when the refusal is about the page itself, not an instruction. */
  | { ok: false; opIndex?: number; error: string };

/** A text node, or nothing at all for empty text (an empty text node is invalid). */
function textContent(text: string): DocNode[] {
  return text.length > 0 ? [{ type: 'text', text }] : [];
}

/**
 * Line endings as the document stores them. Text captured elsewhere (a Windows
 * clipboard, a transcription service, an email body) arrives with CRLF, and a
 * stray carriage return inside a text node is invisible but real. Normalised
 * here as well as at the request boundary so the guarantee holds for any caller.
 */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Text as inline content, with single line breaks preserved as real breaks.
 * Callers paste things people said — a voice memo transcript arrives full of
 * newlines — and a newline inside one text node renders as a single run-on
 * line, so the page wouldn't show what was actually captured.
 */
function inlineContent(text: string): DocNode[] {
  const lines = normalizeNewlines(text).split('\n');
  const out: DocNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) out.push({ type: 'hardBreak' });
    out.push(...textContent(line));
  });
  return out;
}

/** Blank lines separate paragraphs, the way they read when written. */
function paragraphsFrom(text: string): DocNode[] {
  const blocks = normalizeNewlines(text).split(/\n{2,}/);
  return blocks.map((block) => ({ type: 'paragraph', content: inlineContent(block) }));
}

/**
 * Turn requested columns into stored column definitions. Names must be unique
 * (ignoring case) because every later instruction addresses a column by name —
 * two columns called "Kind" would make "set Kind" ambiguous.
 */
function buildColumns(requested: NewColumn[]): { columns: DatabaseColumn[] } | { error: string } {
  if (requested.length === 0) return { error: 'A table needs at least one column' };

  const seen = new Set<string>();
  const columns: DatabaseColumn[] = [];
  for (const spec of requested) {
    const name = spec.name.trim();
    if (name.length === 0) return { error: 'A column needs a name' };
    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `Two columns have the same name "${name}"` };
    seen.add(key);

    if (!COLUMN_TYPES.includes(spec.type)) {
      return { error: `Unknown column type "${String(spec.type)}" for column "${name}"` };
    }

    const column: DatabaseColumn = { id: newId('col'), name, type: spec.type };
    if (spec.type === 'select' || spec.type === 'multiselect') {
      const labels = (spec.options ?? []).map((label) => label.trim());
      const seenLabels = new Set<string>();
      for (const label of labels) {
        const labelKey = label.toLowerCase();
        // Two choices reading the same would be permanently unaddressable —
        // naming either one is ambiguous, so neither could ever be set.
        if (seenLabels.has(labelKey)) {
          return { error: `Column "${name}" has two choices called "${label}"` };
        }
        seenLabels.add(labelKey);
      }
      column.options = labels.map((label) => makeSelectOption(label));
    }
    columns.push(column);
  }
  return { columns };
}

/** Every table in the document, in order. Tables can sit inside a column layout. */
function collectBlocks(nodes: DocNode[], out: DocNode[] = []): DocNode[] {
  for (const node of nodes) {
    // The stored document is untrusted, so an entry can be anything — skip
    // what isn't a node rather than reading through it.
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'databaseBlock') out.push(node);
    if (Array.isArray(node.content)) collectBlocks(node.content, out);
  }
  return out;
}

/** Rebuild the tree with `target` (matched by identity) swapped for `next`. */
function swapNode(nodes: DocNode[], target: DocNode, next: DocNode): DocNode[] {
  return nodes.map((node) => {
    if (node === target) return next;
    // Anything that isn't a node is passed straight through — untouched, so
    // rewriting the tree can't drop it.
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node.content)) {
      return { ...node, content: swapNode(node.content, target, next) };
    }
    return node;
  });
}

/**
 * Which table an instruction is about. A handle is optional when the page holds
 * exactly one table — the common case for the agent's own Inbox — but with
 * several we refuse rather than guess and write to the wrong one.
 */
function resolveBlock(
  content: DocNode[],
  blockId: string | undefined
): { block: DocNode } | { error: string } {
  const blocks = collectBlocks(content);
  if (blockId) {
    const matches = blocks.filter((b) => b.attrs?.id === blockId);
    if (matches.length === 0) return { error: `This page has no table "${blockId}"` };
    if (matches.length > 1) return { error: `This page has more than one table "${blockId}"` };
    return { block: matches[0] };
  }
  if (blocks.length === 0) return { error: 'This page has no table' };
  if (blocks.length > 1) {
    const handles = blocks.map((b) => b.attrs?.id).filter((h) => typeof h === 'string');
    if (handles.length === 0) {
      return {
        error:
          'This page has several tables, none of which has a handle yet — open the page in the app once and they will get one',
      };
    }
    return { error: `This page has several tables — name one of: ${handles.join(', ')}` };
  }
  return { block: blocks[0] };
}

/**
 * A table's stored column definitions.
 *
 * The stored document is untrusted — the content column accepts any JSON, so a
 * column can carry a type this module has never heard of, or be missing its
 * name entirely. Anything that isn't a column we understand is dropped here
 * rather than cast, so the code downstream can rely on its own types. A caller
 * naming a dropped column gets the ordinary "no such column" refusal.
 */
function blockColumns(block: DocNode): DatabaseColumn[] {
  const columns = block.attrs?.columns;
  if (!Array.isArray(columns)) return [];
  return columns.filter((c): c is DatabaseColumn => {
    if (!c || typeof c !== 'object') return false;
    const candidate = c as Partial<DatabaseColumn>;
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return false;
    if (!COLUMN_TYPES.includes(candidate.type as DatabaseColumnType)) return false;
    if (candidate.options !== undefined && !Array.isArray(candidate.options)) return false;
    return true;
  });
}

/** A choice column's usable options — same untrusted-input reasoning as above. */
function columnOptions(column: DatabaseColumn): { id: string; label: string }[] {
  const options = column.options;
  if (!Array.isArray(options)) return [];
  return options.filter(
    (o): o is { id: string; label: string } =>
      !!o && typeof o === 'object' && typeof o.id === 'string' && typeof o.label === 'string'
  );
}

/**
 * A table's stored rows exactly as they are on disk.
 *
 * Writes must build on THIS, not on a cleaned-up copy: anything dropped from
 * the list we save is deleted from the user's table. So an entry we can't make
 * sense of is carried through untouched rather than filtered out, and a `rows`
 * attribute that isn't a list at all is refused — replacing it would throw away
 * whatever was there.
 */
function rawRows(block: DocNode): { rows: unknown[] } | { error: string } {
  const rows = block.attrs?.rows;
  if (rows === undefined || rows === null) return { rows: [] };
  if (!Array.isArray(rows)) {
    return { error: "That table's rows aren't in a shape this API can edit" };
  }
  return { rows };
}

/** Whether a stored entry is a row this API can address. */
function isAddressableRow(value: unknown): value is DatabaseRow {
  return !!value && typeof value === 'object' && typeof (value as DatabaseRow).id === 'string';
}

/** A row's existing cells, or an empty set when it holds something else. */
function rowCells(row: DatabaseRow): Record<string, DatabaseCellValue> {
  const cells = row.cells;
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return {};
  return cells;
}

/** Find a column by the name a caller used — exact first, then ignoring case. */
function resolveColumn(
  columns: DatabaseColumn[],
  name: string
): { column: DatabaseColumn } | { error: string } {
  const exact = columns.filter((c) => c.name === name);
  if (exact.length === 1) return { column: exact[0] };

  const key = name.trim().toLowerCase();
  const loose = columns.filter((c) => c.name.trim().toLowerCase() === key);
  if (loose.length === 1) return { column: loose[0] };
  if (loose.length > 1) return { error: `This table has more than one column called "${name}"` };

  const known = columns.map((c) => c.name).join(', ');
  return { error: `This table has no column "${name}". It has: ${known}` };
}

/**
 * Resolve one choice to the id the table stores. Callers name a choice the way
 * they see it, but a cell holds the option's id — writing the label straight in
 * makes the cell render blank, which reads as data loss.
 */
function resolveOption(column: DatabaseColumn, given: string): { id: string } | { error: string } {
  const options = columnOptions(column);
  const value = given.trim();

  const byId = options.find((o) => o.id === value);
  if (byId) return { id: byId.id };

  const exact = options.filter((o) => o.label === value);
  if (exact.length === 1) return { id: exact[0].id };

  const key = value.toLowerCase();
  const loose = options.filter((o) => o.label.trim().toLowerCase() === key);
  if (loose.length === 1) return { id: loose[0].id };
  if (loose.length > 1) {
    return { error: `"${given}" matches more than one choice in "${column.name}"` };
  }

  const known = options.map((o) => o.label).join(', ') || '(none yet)';
  return {
    error: `"${given}" is not a choice in "${column.name}". Choices are: ${known}`,
  };
}

/** A date as the editor stores it: a plain calendar day. Accepts a full timestamp. */
function normalizeDate(given: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(given.trim());
  if (!match) return null;
  const day = match[1];
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject a well-formed but impossible day (e.g. 2026-02-31 rolls over).
  return parsed.toISOString().slice(0, 10) === day ? day : null;
}

/** Convert a caller's value into what the cell stores, or explain why it can't. */
function toCellValue(
  column: DatabaseColumn,
  raw: unknown
): { value: DatabaseCellValue } | { error: string } {
  const label = `"${column.name}"`;
  if (raw === null || raw === undefined || raw === '') {
    return { value: emptyCellValue(column.type) };
  }

  switch (column.type) {
    case 'text':
      if (typeof raw === 'string') return { value: raw };
      if (typeof raw === 'number' || typeof raw === 'boolean') return { value: String(raw) };
      return { error: `${label} takes text` };

    case 'number':
      if (typeof raw === 'number' && Number.isFinite(raw)) return { value: raw };
      return { error: `${label} takes a number` };

    case 'checkbox':
      if (typeof raw === 'boolean') return { value: raw };
      return { error: `${label} takes true or false` };

    case 'date': {
      if (typeof raw !== 'string') return { error: `${label} takes a date as YYYY-MM-DD` };
      const day = normalizeDate(raw);
      if (!day) return { error: `${label} takes a date as YYYY-MM-DD, not "${raw}"` };
      return { value: day };
    }

    case 'select': {
      if (typeof raw !== 'string') return { error: `${label} takes one choice by name` };
      const resolved = resolveOption(column, raw);
      return 'error' in resolved ? resolved : { value: resolved.id };
    }

    case 'multiselect': {
      const given = typeof raw === 'string' ? [raw] : raw;
      if (!Array.isArray(given) || given.some((v) => typeof v !== 'string')) {
        return { error: `${label} takes a list of choices by name` };
      }
      const ids: string[] = [];
      for (const one of given as string[]) {
        const resolved = resolveOption(column, one);
        if ('error' in resolved) return resolved;
        if (!ids.includes(resolved.id)) ids.push(resolved.id);
      }
      return { value: ids };
    }

    default:
      // Unreachable for a column that came through `blockColumns`, which drops
      // unknown types — but this function must never fall out of the switch
      // returning undefined, because every caller branches on its result.
      return { error: `${label} has a kind this API can't write` };
  }
}

/**
 * Turn the values a caller supplied (keyed by column name) into a cell map
 * keyed by column id. Every column the table has gets a value, so a new row is
 * never half-formed.
 */
function buildCells(
  columns: DatabaseColumn[],
  given: Record<string, unknown>,
  base: Record<string, DatabaseCellValue> | null
): { cells: Record<string, DatabaseCellValue> } | { error: string } {
  const cells: Record<string, DatabaseCellValue> = base
    ? { ...base }
    : Object.fromEntries(columns.map((c) => [c.id, emptyCellValue(c.type)]));

  for (const [name, raw] of Object.entries(given)) {
    const resolvedColumn = resolveColumn(columns, name);
    if ('error' in resolvedColumn) return resolvedColumn;
    const resolvedValue = toCellValue(resolvedColumn.column, raw);
    if ('error' in resolvedValue) return resolvedValue;
    cells[resolvedColumn.column.id] = resolvedValue.value;
  }
  return { cells };
}

/**
 * Read a stored page document.
 *
 * An empty page (never edited) starts a fresh document. Anything else that
 * isn't a document we recognise is REFUSED rather than replaced: the content
 * column accepts any JSON, so if something unexpected is in there, treating it
 * as "empty" would append one paragraph and destroy whatever was stored — the
 * one way this module could lose a page's contents. An unattended caller must
 * not be able to trigger that.
 */
function readDoc(stored: unknown): { doc: TiptapDoc } | { error: string } {
  if (stored === null || stored === undefined) return { doc: { type: 'doc', content: [] } };
  if (typeof stored !== 'object' || Array.isArray(stored)) {
    return { error: "This page's content isn't in a shape this API can edit" };
  }
  const node = stored as { type?: unknown; content?: unknown };
  if (node.type !== 'doc') {
    return { error: "This page's content isn't in a shape this API can edit" };
  }
  if (node.content !== undefined && node.content !== null && !Array.isArray(node.content)) {
    return { error: "This page's content isn't in a shape this API can edit" };
  }
  return {
    doc: { type: 'doc', content: Array.isArray(node.content) ? (node.content as DocNode[]) : [] },
  };
}

/**
 * Apply a batch of edits to a stored page document.
 *
 * All-or-nothing: the first invalid op rejects the whole batch and no document
 * is returned, so a partly-applied write can never reach the database. Callers
 * that want per-item independence send one batch per item.
 */
export function applyOps(stored: unknown, ops: PageOp[]): ApplyResult {
  const read = readDoc(stored);
  if ('error' in read) return { ok: false, error: read.error };

  let content = [...read.doc.content];
  const outcomes: OpOutcome[] = [];

  for (const [opIndex, op] of ops.entries()) {
    switch (op.op) {
      case 'appendParagraph': {
        content.push(...paragraphsFrom(op.text));
        outcomes.push({});
        break;
      }
      case 'appendHeading': {
        // `collapsed` is left off deliberately — the heading node defaults it
        // to false, so omitting it keeps written documents identical to what
        // the editor itself saves for a fresh heading.
        content.push({
          type: 'heading',
          attrs: { level: op.level },
          content: textContent(normalizeNewlines(op.text).replace(/\s*\n+\s*/g, ' ')),
        });
        outcomes.push({});
        break;
      }
      case 'appendBulletList': {
        if (op.items.length === 0) {
          return { ok: false, opIndex, error: 'A bullet list needs at least one item' };
        }
        content.push({
          type: 'bulletList',
          content: op.items.map((item) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: inlineContent(item) }],
          })),
        });
        outcomes.push({});
        break;
      }
      case 'addDatabaseBlock': {
        const built = buildColumns(op.columns);
        if ('error' in built) return { ok: false, opIndex, error: built.error };

        const usedHandles = new Set(
          collectBlocks(content)
            .map((b) => b.attrs?.id)
            .filter((h): h is string => typeof h === 'string')
        );
        let blockId = newId('dbb');
        // A repeated handle would leave both tables unaddressable.
        while (usedHandles.has(blockId)) blockId = newId('dbb');
        content.push({
          type: 'databaseBlock',
          attrs: {
            id: blockId,
            title: op.title?.trim() ? op.title.trim() : null,
            columns: built.columns,
            rows: [] as DatabaseRow[],
          },
        });
        outcomes.push({ blockId });
        break;
      }
      case 'addRows': {
        if (op.rows.length === 0) {
          return { ok: false, opIndex, error: 'No rows given' };
        }
        const target = resolveBlock(content, op.blockId);
        if ('error' in target) return { ok: false, opIndex, error: target.error };

        const columns = blockColumns(target.block);
        if (columns.length === 0) {
          return { ok: false, opIndex, error: 'That table has no columns yet' };
        }

        const stored = rawRows(target.block);
        if ('error' in stored) return { ok: false, opIndex, error: stored.error };
        const takenIds = new Set(stored.rows.filter(isAddressableRow).map((r) => r.id));
        const added: DatabaseRow[] = [];
        for (const given of op.rows) {
          const built = buildCells(columns, given, null);
          if ('error' in built) return { ok: false, opIndex, error: built.error };
          // Handles are random; a repeat would leave one row unaddressable.
          let rowId = newId('row');
          while (takenIds.has(rowId)) rowId = newId('row');
          takenIds.add(rowId);
          added.push({ id: rowId, cells: built.cells });
        }

        const next: DocNode = {
          ...target.block,
          attrs: { ...target.block.attrs, rows: [...stored.rows, ...added] },
        };
        content = swapNode(content, target.block, next);
        outcomes.push({ rowIds: added.map((r) => r.id) });
        break;
      }
      case 'setCells': {
        if (Object.keys(op.values).length === 0) {
          return { ok: false, opIndex, error: 'No values given' };
        }
        const target = resolveBlock(content, op.blockId);
        if ('error' in target) return { ok: false, opIndex, error: target.error };

        const stored = rawRows(target.block);
        if ('error' in stored) return { ok: false, opIndex, error: stored.error };

        const index = stored.rows.findIndex((r) => isAddressableRow(r) && r.id === op.rowId);
        if (index === -1) {
          return { ok: false, opIndex, error: `That table has no row "${op.rowId}"` };
        }
        const row = stored.rows[index] as DatabaseRow;

        // Merged onto the row's existing cells rather than a full set, so a
        // write-back only touches the values it was asked about and can't
        // blank a cell someone filled in by hand meanwhile.
        const built = buildCells(blockColumns(target.block), op.values, rowCells(row));
        if ('error' in built) return { ok: false, opIndex, error: built.error };

        const next: DocNode = {
          ...target.block,
          attrs: {
            ...target.block.attrs,
            // Only the addressed row is rebuilt; every other entry is the one
            // that was stored, so nothing is dropped by writing.
            rows: stored.rows.map((r, i) => (i === index ? { ...row, cells: built.cells } : r)),
          },
        };
        content = swapNode(content, target.block, next);
        outcomes.push({});
        break;
      }
      default: {
        const unknownOp = op as { op?: unknown };
        return { ok: false, opIndex, error: `Unknown instruction "${String(unknownOp.op)}"` };
      }
    }
  }

  return { ok: true, doc: { type: 'doc', content }, outcomes };
}
