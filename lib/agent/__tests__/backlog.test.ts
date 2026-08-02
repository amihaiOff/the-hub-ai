import { extractBacklog } from '../backlog';

// Build a Tiptap doc with a database block that has the given columns/rows.
function pageWithDb(
  id: string,
  title: string,
  columns: { id: string; name: string; type: string }[],
  rows: { id: string; cells: Record<string, unknown> }[],
  extraText = 'Some context paragraph.'
) {
  return {
    id,
    title,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: extraText }] },
        { type: 'databaseBlock', attrs: { columns, rows } },
      ],
    },
  };
}

const COLS = [
  { id: 'c_name', name: 'Name', type: 'text' },
  { id: 'c_notes', name: 'Notes', type: 'text' },
  { id: 'c_claude', name: 'for Claude', type: 'checkbox' },
];

describe('extractBacklog', () => {
  it('returns only rows whose "for Claude" column is checked', () => {
    const page = pageWithDb('p1', 'Roadmap', COLS, [
      { id: 'r1', cells: { c_name: 'Add CSV export', c_notes: 'portfolio page', c_claude: true } },
      { id: 'r2', cells: { c_name: 'Ignore me', c_notes: 'later', c_claude: false } },
      { id: 'r3', cells: { c_name: 'Fix dark mode', c_notes: '', c_claude: true } },
    ]);
    const tasks = extractBacklog([page]);
    expect(tasks.map((t) => t.title)).toEqual(['Add CSV export', 'Fix dark mode']);
  });

  it('uses the Name column as title and exposes other columns as fields (excluding the flag)', () => {
    const page = pageWithDb('p1', 'Roadmap', COLS, [
      { id: 'r1', cells: { c_name: 'Add CSV export', c_notes: 'on portfolio', c_claude: true } },
    ]);
    const [task] = extractBacklog([page]);
    expect(task.title).toBe('Add CSV export');
    expect(task.fields).toEqual({ Name: 'Add CSV export', Notes: 'on portfolio' });
    expect(task.fields['for Claude']).toBeUndefined();
    expect(task.pageId).toBe('p1');
    expect(task.pageTitle).toBe('Roadmap');
    expect(task.rowId).toBe('r1');
  });

  it('includes the page text as context', () => {
    const page = pageWithDb(
      'p1',
      'Roadmap',
      COLS,
      [{ id: 'r1', cells: { c_name: 'X', c_claude: true } }],
      'This page tracks portfolio improvements.'
    );
    const [task] = extractBacklog([page]);
    expect(task.pageContext).toContain('portfolio improvements');
  });

  it('ignores database blocks without a "for Claude" column', () => {
    const cols = [
      { id: 'c_name', name: 'Name', type: 'text' },
      { id: 'c_status', name: 'Status', type: 'select' },
    ];
    const page = pageWithDb('p1', 'Roadmap', cols, [
      { id: 'r1', cells: { c_name: 'Not a claude task', c_status: 'Todo' } },
    ]);
    expect(extractBacklog([page])).toEqual([]);
  });

  it('matches the flag column by name case-insensitively and treats non-empty strings as checked', () => {
    const cols = [
      { id: 'c_name', name: 'Task', type: 'text' },
      { id: 'c_flag', name: 'CLAUDE', type: 'text' },
    ];
    const page = pageWithDb('p1', 'Roadmap', cols, [
      { id: 'r1', cells: { c_name: 'Do it', c_flag: 'yes' } },
      { id: 'r2', cells: { c_name: 'Skip', c_flag: '' } },
    ]);
    expect(extractBacklog([page]).map((t) => t.title)).toEqual(['Do it']);
  });

  it('walks nested content (database block inside a column layout)', () => {
    const page = {
      id: 'p1',
      title: 'Roadmap',
      content: {
        type: 'doc',
        content: [
          {
            type: 'columnBlock',
            content: [
              {
                type: 'column',
                content: [
                  {
                    type: 'databaseBlock',
                    attrs: {
                      columns: COLS,
                      rows: [{ id: 'r1', cells: { c_name: 'Nested task', c_claude: true } }],
                    },
                  },
                ],
              },
              { type: 'column', content: [{ type: 'paragraph' }] },
            ],
          },
        ],
      },
    };
    expect(extractBacklog([page]).map((t) => t.title)).toEqual(['Nested task']);
  });

  it('handles pages with null content', () => {
    expect(extractBacklog([{ id: 'p1', title: 'Empty', content: null }])).toEqual([]);
  });

  it('scans database blocks across every tab (contents array) and merges page context', () => {
    const tab1 = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First tab notes.' }] },
        {
          type: 'databaseBlock',
          attrs: {
            columns: COLS,
            rows: [{ id: 'r1', cells: { c_name: 'Old task', c_claude: true } }],
          },
        },
      ],
    };
    const tab2 = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Second tab notes.' }] },
        {
          type: 'databaseBlock',
          attrs: {
            columns: COLS,
            rows: [
              { id: 'r2', cells: { c_name: 'New task added today', c_claude: true } },
              { id: 'r3', cells: { c_name: 'Not flagged', c_claude: false } },
            ],
          },
        },
      ],
    };
    const tasks = extractBacklog([{ id: 'p1', title: 'The hub AI', contents: [tab1, tab2] }]);
    expect(tasks.map((t) => t.title)).toEqual(['Old task', 'New task added today']);
    expect(tasks[1].pageContext).toContain('First tab notes.');
    expect(tasks[1].pageContext).toContain('Second tab notes.');
  });

  it('yields no tasks (and does not crash) for a page with an empty tabs/contents array', () => {
    expect(extractBacklog([{ id: 'p1', title: 'Untabbed page', contents: [] }])).toEqual([]);
  });

  it('skips null tab contents inside the contents array', () => {
    const tab = {
      type: 'doc',
      content: [
        {
          type: 'databaseBlock',
          attrs: {
            columns: COLS,
            rows: [{ id: 'r1', cells: { c_name: 'Real task', c_claude: true } }],
          },
        },
      ],
    };
    const tasks = extractBacklog([{ id: 'p1', title: 'Roadmap', contents: [null, tab] }]);
    expect(tasks.map((t) => t.title)).toEqual(['Real task']);
  });
});
