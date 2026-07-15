/**
 * Extracts the "Claude backlog" from Areas pages: rows of a page's database
 * block whose "for Claude" column is checked. Each such row becomes a task for
 * the Claude Code agent to implement, carrying its other columns and the
 * surrounding page text as context.
 *
 * Pure functions (no DB / React) so they're easy to unit-test; the route layer
 * loads the pages and calls `extractBacklog`.
 */

type CellValue = string | number | boolean | null;
interface DbColumn {
  id: string;
  name: string;
  type: string;
  options?: { id: string; label: string }[];
}
interface DbRow {
  id: string;
  cells: Record<string, CellValue>;
}

/** A single backlog task extracted from a database-block row. */
export interface BacklogTask {
  pageId: string;
  pageTitle: string;
  rowId: string;
  /** Best-guess task title (Name/Title/Task column, else first text column). */
  title: string;
  /** All other column values keyed by column name — context for the task. */
  fields: Record<string, CellValue>;
  /** Plain text of the owning page — extra context for understanding the task. */
  pageContext: string;
}

interface PageInput {
  id: string;
  title: string;
  content: unknown;
}

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string };

/** Depth-first walk of a Tiptap/ProseMirror doc, yielding every node. */
function* walk(node: Node | null | undefined): Generator<Node> {
  if (!node || typeof node !== 'object') return;
  yield node;
  if (Array.isArray(node.content)) {
    for (const child of node.content) yield* walk(child);
  }
}

/** Concatenate all text nodes in a doc (skips database blocks — they're atoms). */
function extractText(root: Node | null | undefined): string {
  const parts: string[] = [];
  for (const n of walk(root)) {
    if (n.type === 'databaseBlock') continue;
    if (typeof n.text === 'string') parts.push(n.text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** True for the checkbox/flag column that marks a row as "for Claude". */
function isClaudeColumn(col: DbColumn): boolean {
  return /claude/i.test(col.name);
}

/** Pick the column that best represents a row's title. */
function titleColumn(cols: DbColumn[]): DbColumn | undefined {
  return (
    cols.find((c) => /^(name|title|task)$/i.test(c.name)) ||
    cols.find((c) => c.type === 'text' && !isClaudeColumn(c)) ||
    cols.find((c) => !isClaudeColumn(c))
  );
}

function cellToString(v: CellValue): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/**
 * Pull every "for Claude"-checked row out of the given pages' database blocks.
 * A row counts as flagged when its value in a column whose name contains
 * "claude" is truthy (checkbox true, or any non-empty value).
 */
export function extractBacklog(pages: PageInput[]): BacklogTask[] {
  const tasks: BacklogTask[] = [];

  for (const page of pages) {
    const root = page.content as Node | null;
    if (!root) continue;
    const pageContext = extractText(root);

    for (const node of walk(root)) {
      if (node.type !== 'databaseBlock') continue;
      const cols = (node.attrs?.columns as DbColumn[] | undefined) ?? [];
      const rows = (node.attrs?.rows as DbRow[] | undefined) ?? [];
      const claudeCol = cols.find(isClaudeColumn);
      if (!claudeCol) continue;

      const titleCol = titleColumn(cols);
      for (const row of rows) {
        const flag = row.cells?.[claudeCol.id];
        const flagged =
          flag === true || (typeof flag === 'string' && flag.trim() !== '') || flag === 1;
        if (!flagged) continue;

        const fields: Record<string, CellValue> = {};
        for (const col of cols) {
          if (col.id === claudeCol.id) continue;
          fields[col.name] = row.cells?.[col.id] ?? null;
        }

        tasks.push({
          pageId: page.id,
          pageTitle: page.title,
          rowId: row.id,
          title: titleCol ? cellToString(row.cells?.[titleCol.id] ?? '') : '',
          fields,
          pageContext,
        });
      }
    }
  }

  return tasks;
}
