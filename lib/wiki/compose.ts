/**
 * Wiki concept body composition + path helpers.
 *
 * The stored `body` is the human-readable summary + optional
 * project-relevance section, rendered on the view page. Questions live in
 * a sibling table (see WikiQuestion) so the quiz UI can render structured
 * options without re-parsing markdown; on OKF export the questions are
 * inlined into the body as a fenced YAML block under `# Questions`.
 */

export function composeBody(parts: {
  summaryMarkdown: string;
  projectRelevanceMarkdown: string | null;
}): string {
  const chunks: string[] = ['# Summary', '', parts.summaryMarkdown.trim()];
  if (parts.projectRelevanceMarkdown && parts.projectRelevanceMarkdown.trim()) {
    chunks.push('', '# Project relevance', '', parts.projectRelevanceMarkdown.trim());
  }
  return chunks.join('\n');
}

/** Produce an OKF-style path fragment from a title, safe as a URL segment. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 80) || 'untitled';
}

/**
 * Build a concept path for a new Source. Paths are unique-per-household;
 * caller retries with a numeric suffix on collision.
 */
export function sourcePathFor(title: string, year: number): string {
  return `sources/${year}/${slugify(title)}`;
}

export function projectPathFor(title: string): string {
  return `projects/${slugify(title)}`;
}
