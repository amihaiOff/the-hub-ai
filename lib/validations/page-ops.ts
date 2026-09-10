import { z } from 'zod';

/**
 * The request shape for the structured page-write endpoint.
 *
 * This layer checks the *form* of an instruction (is it one we offer, are the
 * strings sane, is the payload a reasonable size). Whether an instruction makes
 * sense against a particular table — does that column exist, is that a real
 * choice — is decided in `lib/pages/page-ops.ts`, which can see the document.
 */

/**
 * Control characters other than tab and newline: a character in the Cc
 * category that is not one of the two we allow. Postgres `jsonb` rejects a NUL
 * outright, so letting one through would turn a write into an opaque server
 * error; refusing it here keeps the promise that anything this endpoint
 * accepts is actually storable.
 */
const CONTROL_CHARS = /[^\P{Cc}\n\t]/u;

const storableText = (max: number) =>
  z
    .string()
    .max(max)
    // Windows clipboards, transcription services and email payloads all deliver
    // CRLF. Refusing it would fail perfectly ordinary captured text, and an
    // unattended caller would have no idea why, so line endings are normalised
    // instead of rejected.
    .transform((v) => v.replace(/\r\n?/g, '\n'))
    .refine((v) => !CONTROL_CHARS.test(v), {
      message: 'Text contains a control character that cannot be stored',
    });

/** Prose written into the page. Generous, since a captured note can be long. */
const bodyText = storableText(10_000);
/** A single line: a heading, a bullet, a cell value. */
const lineText = storableText(2_000);
const columnName = storableText(200).pipe(z.string().trim().min(1));
const optionLabel = storableText(200).pipe(z.string().trim().min(1));

/** What a caller may put in a cell. The column's type decides what's accepted. */
const cellValue = z.union([lineText, z.number(), z.boolean(), z.null(), z.array(lineText).max(50)]);

/**
 * Values keyed by column name. Capped: a table has at most 50 columns, so a
 * request naming hundreds is malformed rather than ambitious.
 */
const cellValues = z
  .record(columnName, cellValue)
  .refine((v) => Object.keys(v).length <= 50, { message: 'Too many columns named at once' });

const newColumn = z.object({
  name: columnName,
  type: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'checkbox']),
  /** Choice names, for `select` / `multiselect`. */
  options: z.array(optionLabel).max(50).optional(),
});

export const pageOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('appendParagraph'), text: bodyText }),
  z.object({
    op: z.literal('appendHeading'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: lineText,
  }),
  z.object({ op: z.literal('appendBulletList'), items: z.array(lineText).min(1).max(100) }),
  z.object({
    op: z.literal('addDatabaseBlock'),
    title: storableText(200).optional(),
    columns: z.array(newColumn).min(1).max(50),
  }),
  z.object({
    op: z.literal('addRows'),
    blockId: z.string().min(1).max(100).optional(),
    rows: z.array(cellValues).min(1).max(100),
  }),
  z.object({
    op: z.literal('setCells'),
    blockId: z.string().min(1).max(100).optional(),
    rowId: z.string().min(1).max(100),
    values: cellValues,
  }),
]);

export const pageOpsRequestSchema = z.object({
  /** Which tab to write to. Defaults to the page's first tab. */
  tabId: z.string().min(1).optional(),
  /**
   * The tab's last-modified stamp as the caller last read it. Required: the
   * write only lands if nothing has changed since, which is what stops it
   * overwriting an edit made in the meantime, and what makes a retried request
   * safe — retrying a write that already succeeded is refused rather than
   * appending the same rows a second time.
   */
  ifUnchangedSince: z.iso.datetime(),
  ops: z.array(pageOpSchema).min(1).max(50),
});
export type PageOpsRequest = z.infer<typeof pageOpsRequestSchema>;

/**
 * A validation message that says *where* the problem is.
 *
 * The shared `getFirstZodError` drops the path for backwards compatibility,
 * which is wrong for this endpoint specifically: its caller is a program that
 * cannot compose a document itself and has to correct its own request from the
 * error text alone. A bare "Invalid input" gives it nothing to go on.
 */
export function describeOpsError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Validation error';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
