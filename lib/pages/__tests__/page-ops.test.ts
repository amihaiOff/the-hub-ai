import { applyOps } from '@/lib/pages/page-ops';

describe('appendParagraph', () => {
  it('writes a paragraph into a page that has no content yet', () => {
    const result = applyOps(null, [{ op: 'appendParagraph', text: 'Groceries for Friday' }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Groceries for Friday' }] }],
    });
  });
});

describe('appendHeading and appendBulletList', () => {
  const existing = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'already here' }] }],
  };

  it('adds a heading after the content already on the page', () => {
    const result = applyOps(existing, [{ op: 'appendHeading', level: 2, text: 'Tuesday' }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'already here' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tuesday' }] },
    ]);
  });

  it('leaves the stored document untouched', () => {
    applyOps(existing, [{ op: 'appendHeading', level: 1, text: 'x' }]);
    expect(existing.content).toHaveLength(1);
  });

  it('adds bullet points as a list', () => {
    const result = applyOps(null, [{ op: 'appendBulletList', items: ['milk', 'bread'] }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content).toEqual([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'milk' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bread' }] }],
          },
        ],
      },
    ]);
  });

  it('refuses a bullet list with no items rather than writing an empty list', () => {
    const result = applyOps(null, [{ op: 'appendBulletList', items: [] }]);
    expect(result).toEqual({
      ok: false,
      opIndex: 0,
      error: expect.stringContaining('at least one'),
    });
  });

  it('applies several instructions in order in one go', () => {
    const result = applyOps(null, [
      { op: 'appendHeading', level: 3, text: 'Dump' },
      { op: 'appendParagraph', text: 'verbatim text' },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content.map((n) => n.type)).toEqual(['heading', 'paragraph']);
  });
});

describe('addDatabaseBlock', () => {
  const columns = [
    { name: 'Suggestion', type: 'text' as const },
    { name: 'Kind', type: 'select' as const, options: ['task', 'note'] },
    { name: 'Approve', type: 'checkbox' as const },
  ];

  it('builds a table with the requested columns and no rows', () => {
    const result = applyOps(null, [{ op: 'addDatabaseBlock', title: 'Inbox', columns }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.doc.content[0];
    expect(block.type).toBe('databaseBlock');
    expect(block.attrs?.title).toBe('Inbox');
    expect(block.attrs?.rows).toEqual([]);
    expect((block.attrs?.columns as { name: string; type: string }[]).map((c) => c.name)).toEqual([
      'Suggestion',
      'Kind',
      'Approve',
    ]);
  });

  it('turns the option names given for a choice column into stored options', () => {
    const result = applyOps(null, [{ op: 'addDatabaseBlock', columns }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cols = result.doc.content[0].attrs?.columns as {
      name: string;
      options?: { id: string; label: string }[];
    }[];
    expect(cols[1].options?.map((o) => o.label)).toEqual(['task', 'note']);
    expect(cols[1].options?.every((o) => typeof o.id === 'string' && o.id.length > 0)).toBe(true);
    expect(cols[0].options).toBeUndefined();
  });

  it('reports back the table and column handles so later instructions can address them', () => {
    const result = applyOps(null, [{ op: 'addDatabaseBlock', title: 'Inbox', columns }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.doc.content[0];
    expect(result.outcomes[0].blockId).toBe(block.attrs?.id);
    expect(typeof result.outcomes[0].blockId).toBe('string');
  });

  it('refuses two columns with the same name, which would be impossible to address', () => {
    const result = applyOps(null, [
      {
        op: 'addDatabaseBlock',
        columns: [
          { name: 'Kind', type: 'text' as const },
          { name: 'kind', type: 'text' as const },
        ],
      },
    ]);
    expect(result).toEqual({
      ok: false,
      opIndex: 0,
      error: expect.stringContaining('same name'),
    });
  });

  it('refuses a table with no columns', () => {
    const result = applyOps(null, [{ op: 'addDatabaseBlock', columns: [] }]);
    expect(result.ok).toBe(false);
  });
});

/** A page holding one table: a text column, a choice column, a tick box. */
const pageWithTable = {
  type: 'doc',
  content: [
    {
      type: 'databaseBlock',
      attrs: {
        id: 'dbb_inbox',
        title: 'Inbox',
        columns: [
          { id: 'col_s', name: 'Suggestion', type: 'text' },
          {
            id: 'col_k',
            name: 'Kind',
            type: 'select',
            options: [
              { id: 'opt_task', label: 'task' },
              { id: 'opt_note', label: 'note' },
            ],
          },
          {
            id: 'col_t',
            name: 'Tags',
            type: 'multiselect',
            options: [
              { id: 'opt_home', label: 'home' },
              { id: 'opt_work', label: 'work' },
            ],
          },
          { id: 'col_a', name: 'Approve', type: 'checkbox' },
          { id: 'col_d', name: 'Due', type: 'date' },
          { id: 'col_n', name: 'Count', type: 'number' },
        ],
        rows: [{ id: 'row_old', cells: { col_s: 'existing row' } }],
      },
    },
  ],
};

describe('addRows', () => {
  it('adds a row addressed by column name, after the rows already there', () => {
    const result = applyOps(pageWithTable, [
      { op: 'addRows', blockId: 'dbb_inbox', rows: [{ Suggestion: 'call the plumber' }] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as {
      id: string;
      cells: Record<string, unknown>;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('row_old');
    expect(rows[1].cells.col_s).toBe('call the plumber');
  });

  it('stores a choice given by its visible name as the choice the table actually keeps', () => {
    const result = applyOps(pageWithTable, [
      { op: 'addRows', blockId: 'dbb_inbox', rows: [{ Suggestion: 'x', Kind: 'task' }] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[1].cells.col_k).toBe('opt_task');
  });

  it('stores several tags given by name', () => {
    const result = applyOps(pageWithTable, [
      { op: 'addRows', blockId: 'dbb_inbox', rows: [{ Tags: ['home', 'work'] }] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[1].cells.col_t).toEqual(['opt_home', 'opt_work']);
  });

  it('fills every column it was not told about, so the row is complete', () => {
    const result = applyOps(pageWithTable, [
      { op: 'addRows', blockId: 'dbb_inbox', rows: [{ Suggestion: 'only this' }] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[1].cells).toEqual({
      col_s: 'only this',
      col_k: null,
      col_t: [],
      col_a: false,
      col_d: null,
      col_n: null,
    });
  });

  it('takes a tick box, a date and a number', () => {
    const result = applyOps(pageWithTable, [
      {
        op: 'addRows',
        blockId: 'dbb_inbox',
        rows: [{ Approve: true, Due: '2026-09-15', Count: 3 }],
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[1].cells.col_a).toBe(true);
    expect(rows[1].cells.col_d).toBe('2026-09-15');
    expect(rows[1].cells.col_n).toBe(3);
  });

  it('adds several rows in one go and reports their handles in order', () => {
    const result = applyOps(pageWithTable, [
      { op: 'addRows', blockId: 'dbb_inbox', rows: [{ Suggestion: 'a' }, { Suggestion: 'b' }] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as {
      id: string;
      cells: Record<string, unknown>;
    }[];
    expect(result.outcomes[0].rowIds).toEqual([rows[1].id, rows[2].id]);
    expect(rows[1].cells.col_s).toBe('a');
    expect(rows[2].cells.col_s).toBe('b');
  });

  it('finds the only table on the page without being told which one', () => {
    const result = applyOps(pageWithTable, [{ op: 'addRows', rows: [{ Suggestion: 'a' }] }]);
    expect(result.ok).toBe(true);
  });

  it('leaves the stored document untouched', () => {
    applyOps(pageWithTable, [{ op: 'addRows', blockId: 'dbb_inbox', rows: [{ Suggestion: 'a' }] }]);
    expect((pageWithTable.content[0].attrs.rows as unknown[]).length).toBe(1);
  });
});

describe('setCells', () => {
  it('changes only the values named, leaving the rest of the row alone', () => {
    const result = applyOps(pageWithTable, [
      {
        op: 'setCells',
        blockId: 'dbb_inbox',
        rowId: 'row_old',
        values: { Approve: true, Kind: 'note' },
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as {
      id: string;
      cells: Record<string, unknown>;
    }[];
    expect(rows[0].cells).toEqual({ col_s: 'existing row', col_a: true, col_k: 'opt_note' });
  });

  it('refuses a row that is not there', () => {
    const result = applyOps(pageWithTable, [
      { op: 'setCells', blockId: 'dbb_inbox', rowId: 'row_gone', values: { Approve: true } },
    ]);
    expect(result).toEqual({ ok: false, opIndex: 0, error: expect.stringContaining('row_gone') });
  });

  it('leaves the stored document untouched', () => {
    applyOps(pageWithTable, [
      { op: 'setCells', blockId: 'dbb_inbox', rowId: 'row_old', values: { Approve: true } },
    ]);
    const rows = pageWithTable.content[0].attrs.rows as { cells: Record<string, unknown> }[];
    expect(rows[0].cells.col_a).toBeUndefined();
  });
});

describe('what it refuses to write', () => {
  const attempt = (values: Record<string, unknown>) =>
    applyOps(pageWithTable, [{ op: 'addRows', blockId: 'dbb_inbox', rows: [values] }]);

  it('refuses a column the table does not have, and says what it does have', () => {
    const result = attempt({ Priority: 'high' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no column "Priority"');
    expect(result.error).toContain('Suggestion');
  });

  it('refuses a made-up choice, and lists the real ones', () => {
    const result = attempt({ Kind: 'reminder' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not a choice');
    expect(result.error).toContain('task, note');
  });

  it('refuses a vague date rather than storing something unreadable', () => {
    expect(attempt({ Due: 'next tuesday' }).ok).toBe(false);
    expect(attempt({ Due: '2026-02-31' }).ok).toBe(false);
  });

  it('refuses text where a number belongs, and a number where a tick belongs', () => {
    expect(attempt({ Count: 'three' }).ok).toBe(false);
    expect(attempt({ Approve: 1 }).ok).toBe(false);
  });

  it('accepts a choice whose name differs only in case, and a full timestamp for a date', () => {
    const relaxed = attempt({ Kind: 'TASK', Due: '2026-09-15T10:30:00Z' });
    expect(relaxed.ok).toBe(true);
    if (!relaxed.ok) return;
    const rows = relaxed.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[1].cells.col_k).toBe('opt_task');
    expect(rows[1].cells.col_d).toBe('2026-09-15');
  });

  it('writes nothing at all when a later instruction in the batch is bad', () => {
    const result = applyOps(pageWithTable, [
      { op: 'appendParagraph', text: 'this should not survive' },
      { op: 'addRows', blockId: 'dbb_inbox', rows: [{ Kind: 'nonsense' }] },
    ]);
    expect(result).toEqual({ ok: false, opIndex: 1, error: expect.any(String) });
  });

  it('refuses to guess when the page holds more than one table', () => {
    const twoTables = {
      type: 'doc',
      content: [
        ...pageWithTable.content,
        {
          ...pageWithTable.content[0],
          attrs: { ...pageWithTable.content[0].attrs, id: 'dbb_other' },
        },
      ],
    };
    const result = applyOps(twoTables, [{ op: 'addRows', rows: [{ Suggestion: 'a' }] }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('several tables');
  });

  it('finds a table nested inside a two-column layout', () => {
    const nested = {
      type: 'doc',
      content: [
        {
          type: 'columnBlock',
          content: [{ type: 'column', content: [pageWithTable.content[0]] }],
        },
      ],
    };
    const result = applyOps(nested, [{ op: 'addRows', rows: [{ Suggestion: 'a' }] }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = (result.doc.content[0].content?.[0].content?.[0] ?? {}) as DocNodeLike;
    expect((block.attrs?.rows as unknown[]).length).toBe(2);
  });
});

type DocNodeLike = { attrs?: Record<string, unknown> };

describe('when the page content is not something we can edit', () => {
  it('refuses rather than replacing content it does not recognise', () => {
    const result = applyOps({ notADoc: true }, [{ op: 'appendParagraph', text: 'hello' }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("isn't in a shape");
  });

  it('refuses a stored array, rather than treating it as an empty page', () => {
    expect(applyOps([], [{ op: 'appendParagraph', text: 'hello' }]).ok).toBe(false);
  });

  it('starts a fresh page only when there is genuinely nothing stored', () => {
    expect(applyOps(null, [{ op: 'appendParagraph', text: 'a' }]).ok).toBe(true);
    expect(applyOps(undefined, [{ op: 'appendParagraph', text: 'a' }]).ok).toBe(true);
  });

  it('ignores a column of a kind it has never heard of instead of crashing', () => {
    const odd = {
      type: 'doc',
      content: [
        {
          type: 'databaseBlock',
          attrs: {
            id: 'dbb_odd',
            columns: [
              { id: 'col_ok', name: 'Name', type: 'text' },
              { id: 'col_weird', name: 'Mystery', type: 'url' },
              null,
              { id: 'col_noname', type: 'text' },
            ],
            rows: [null, { id: 'row_ok', cells: {} }, { cells: {} }],
          },
        },
      ],
    };

    const usable = applyOps(odd, [{ op: 'addRows', rows: [{ Name: 'fine' }] }]);
    expect(usable.ok).toBe(true);
    if (!usable.ok) return;
    // Everything that was stored is still stored — writing must never quietly
    // drop rows this API happens not to understand.
    const after = usable.doc.content[0].attrs?.rows as unknown[];
    expect(after).toHaveLength(4);
    expect(after.slice(0, 3)).toEqual(odd.content[0].attrs.rows);

    const unusable = applyOps(odd, [{ op: 'addRows', rows: [{ Mystery: 'x' }] }]);
    expect(unusable.ok).toBe(false);
    if (unusable.ok) return;
    expect(unusable.error).toContain('no column "Mystery"');
  });

  it('can still write to a row that predates cells being stored', () => {
    const legacy = {
      type: 'doc',
      content: [
        {
          type: 'databaseBlock',
          attrs: {
            id: 'dbb_legacy',
            columns: [{ id: 'col_a', name: 'Approve', type: 'checkbox' }],
            rows: [{ id: 'row_bare' }],
          },
        },
      ],
    };
    const result = applyOps(legacy, [
      { op: 'setCells', rowId: 'row_bare', values: { Approve: true } },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[0].cells).toEqual({ col_a: true });
  });
});

describe('addressing choices and text edge cases', () => {
  it('accepts a choice given by its stored handle as well as by name', () => {
    const result = applyOps(pageWithTable, [
      { op: 'addRows', blockId: 'dbb_inbox', rows: [{ Kind: 'opt_note' }] },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[1].cells.col_k).toBe('opt_note');
  });

  it('refuses a name that matches two choices rather than picking one', () => {
    const ambiguous = {
      type: 'doc',
      content: [
        {
          type: 'databaseBlock',
          attrs: {
            id: 'dbb_amb',
            columns: [
              {
                id: 'col_k',
                name: 'Kind',
                type: 'select',
                options: [
                  { id: 'o1', label: 'Task' },
                  { id: 'o2', label: 'task' },
                ],
              },
            ],
            rows: [],
          },
        },
      ],
    };
    const result = applyOps(ambiguous, [{ op: 'addRows', rows: [{ Kind: 'TASK' }] }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('more than one choice');
  });

  it('keeps a captured note readable — blank lines split it, single breaks survive', () => {
    const result = applyOps(null, [
      { op: 'appendParagraph', text: 'first line\nsecond line\n\nnew paragraph' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'first line' },
          { type: 'hardBreak' },
          { type: 'text', text: 'second line' },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'new paragraph' }] },
    ]);
  });

  it('writes an empty paragraph with no text inside it', () => {
    const result = applyOps(null, [{ op: 'appendParagraph', text: '' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content).toEqual([{ type: 'paragraph', content: [] }]);
  });

  it('refuses a table with two choices reading the same', () => {
    const result = applyOps(null, [
      {
        op: 'addDatabaseBlock',
        columns: [{ name: 'Kind', type: 'select' as const, options: ['task', 'Task'] }],
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('two choices');
  });
});

describe('never losing what was already stored', () => {
  const oddRows = [
    null,
    { id: 'row_ok', cells: { col_a: false } },
    { cells: { col_a: true } },
    { id: 42 },
  ];
  const table = {
    type: 'doc',
    content: [
      {
        type: 'databaseBlock',
        attrs: {
          id: 'dbb_x',
          columns: [{ id: 'col_a', name: 'Approve', type: 'checkbox' }],
          rows: oddRows,
        },
      },
    ],
  };

  it('keeps unreadable rows when writing to a readable one', () => {
    const result = applyOps(table, [
      { op: 'setCells', rowId: 'row_ok', values: { Approve: true } },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { id?: unknown; cells?: unknown }[];
    expect(rows).toHaveLength(4);
    expect(rows[0]).toBeNull();
    expect(rows[1]).toEqual({ id: 'row_ok', cells: { col_a: true } });
    expect(rows[2]).toEqual({ cells: { col_a: true } });
    expect(rows[3]).toEqual({ id: 42 });
  });

  it('refuses a table whose rows are not a list, rather than replacing them', () => {
    const broken = {
      type: 'doc',
      content: [
        {
          type: 'databaseBlock',
          attrs: {
            id: 'dbb_b',
            columns: [{ id: 'col_a', name: 'Approve', type: 'checkbox' }],
            rows: 'not a list',
          },
        },
      ],
    };
    expect(applyOps(broken, [{ op: 'addRows', rows: [{ Approve: true }] }]).ok).toBe(false);
  });

  it('refuses a page whose content is not a list, rather than starting over', () => {
    expect(
      applyOps({ type: 'doc', content: 'nope' }, [{ op: 'appendParagraph', text: 'x' }]).ok
    ).toBe(false);
  });

  it('writes to a row whose cells are not a set of values without keeping the junk', () => {
    const weird = {
      type: 'doc',
      content: [
        {
          type: 'databaseBlock',
          attrs: {
            id: 'dbb_w',
            columns: [{ id: 'col_a', name: 'Approve', type: 'checkbox' }],
            rows: [{ id: 'row_w', cells: 'oops' }],
          },
        },
      ],
    };
    const result = applyOps(weird, [{ op: 'setCells', rowId: 'row_w', values: { Approve: true } }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.doc.content[0].attrs?.rows as { cells: Record<string, unknown> }[];
    expect(rows[0].cells).toEqual({ col_a: true });
  });
});

describe('captured text arriving from other systems', () => {
  it('treats Windows-style line endings the same as plain ones', () => {
    const result = applyOps(null, [
      { op: 'appendParagraph', text: 'line one\r\nline two\r\n\r\nnext paragraph' },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'line one' },
          { type: 'hardBreak' },
          { type: 'text', text: 'line two' },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'next paragraph' }] },
    ]);
  });
});

describe('stray entries in a page document', () => {
  const withGaps = {
    type: 'doc',
    content: [
      null,
      { type: 'paragraph', content: [{ type: 'text', text: 'keep me' }] },
      {
        type: 'columnBlock',
        content: [{ type: 'column', content: [null, pageWithTable.content[0]] }],
      },
    ],
  };

  it('writes to a table alongside them, and keeps them', () => {
    const result = applyOps(withGaps, [{ op: 'addRows', rows: [{ Suggestion: 'a' }] }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content[0]).toBeNull();
    expect(result.doc.content[1]).toEqual(withGaps.content[1]);
    const nested = result.doc.content[2].content?.[0].content as {
      attrs?: Record<string, unknown>;
    }[];
    expect(nested[0]).toBeNull();
    expect((nested[1].attrs?.rows as unknown[]).length).toBe(2);
  });

  it('adds a table to such a page without tripping over them', () => {
    const result = applyOps(withGaps, [
      { op: 'addDatabaseBlock', columns: [{ name: 'Name', type: 'text' as const }] },
    ]);
    expect(result.ok).toBe(true);
  });
});
