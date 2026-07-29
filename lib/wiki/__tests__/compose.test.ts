import { slugify, sourcePathFor, projectPathFor, composeBody } from '../compose';

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips accents / combining marks', () => {
    expect(slugify('Café Déjà')).toBe('cafe-deja');
  });

  it('collapses runs of non-alphanumerics and trims edge hyphens', () => {
    expect(slugify('  A/B — C!!  ')).toBe('a-b-c');
  });

  it('caps the slug at 80 characters', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(80);
  });

  it('falls back to "untitled" for empty or symbol-only input', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
  });
});

describe('path builders', () => {
  it('sourcePathFor nests the slug under the year', () => {
    expect(sourcePathFor('My Article', 2026)).toBe('sources/2026/my-article');
  });

  it('projectPathFor nests the slug under projects/', () => {
    expect(projectPathFor('Agentic Tools')).toBe('projects/agentic-tools');
  });
});

describe('composeBody', () => {
  it('renders the summary section alone when there is no project relevance', () => {
    expect(composeBody({ summaryMarkdown: 'S body', projectRelevanceMarkdown: null })).toBe(
      '# Summary\n\nS body'
    );
  });

  it('appends a project-relevance section when present', () => {
    expect(composeBody({ summaryMarkdown: 'S', projectRelevanceMarkdown: 'R' })).toBe(
      '# Summary\n\nS\n\n# Project relevance\n\nR'
    );
  });

  it('ignores a blank/whitespace-only project relevance', () => {
    expect(composeBody({ summaryMarkdown: 'S', projectRelevanceMarkdown: '   ' })).toBe(
      '# Summary\n\nS'
    );
  });

  it('trims the parts', () => {
    expect(composeBody({ summaryMarkdown: '  S  ', projectRelevanceMarkdown: null })).toBe(
      '# Summary\n\nS'
    );
  });
});
