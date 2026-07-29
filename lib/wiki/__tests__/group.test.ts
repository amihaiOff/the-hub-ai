import { groupWikiConcepts } from '../group';
import type { WikiConceptListRow } from '@/lib/hooks/use-wiki';

function row(over: Partial<WikiConceptListRow> & { id: string }): WikiConceptListRow {
  return {
    path: over.id,
    type: 'Source',
    title: over.id,
    description: null,
    projectIds: [],
    sourceUrl: null,
    generatedAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('groupWikiConcepts', () => {
  it('puts project-less sources in the top section', () => {
    const { unassignedSources, projects } = groupWikiConcepts([row({ id: 's1' }), row({ id: 's2' })]);
    expect(unassignedSources.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(projects).toEqual([]);
  });

  it('nests sources under their project, keeps empty projects, sorts by title', () => {
    const { unassignedSources, projects } = groupWikiConcepts([
      row({ id: 'pB', type: 'Project', title: 'B project' }),
      row({ id: 'pA', type: 'Project', title: 'A project' }),
      row({ id: 's1', projectIds: ['pA'] }),
      row({ id: 's2', projectIds: ['pA'] }),
      row({ id: 's3' }),
    ]);
    expect(unassignedSources.map((s) => s.id)).toEqual(['s3']);
    // Sorted by title → A before B.
    expect(projects.map((g) => g.project.id)).toEqual(['pA', 'pB']);
    expect(projects[0].sources.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(projects[1].sources).toEqual([]); // empty project still surfaced
  });

  it('lists a multi-project source under each of its projects', () => {
    const { unassignedSources, projects } = groupWikiConcepts([
      row({ id: 'pA', type: 'Project', title: 'A' }),
      row({ id: 'pB', type: 'Project', title: 'B' }),
      row({ id: 's1', projectIds: ['pA', 'pB'] }),
    ]);
    expect(unassignedSources).toEqual([]);
    expect(projects.find((g) => g.project.id === 'pA')?.sources.map((s) => s.id)).toEqual(['s1']);
    expect(projects.find((g) => g.project.id === 'pB')?.sources.map((s) => s.id)).toEqual(['s1']);
  });

  it('treats a source with only dangling memberships as unassigned', () => {
    const { unassignedSources, projects } = groupWikiConcepts([
      row({ id: 's1', projectIds: ['ghost'] }),
    ]);
    expect(unassignedSources.map((s) => s.id)).toEqual(['s1']);
    expect(projects).toEqual([]);
  });

  it('never lists Project concepts as sources', () => {
    const { unassignedSources } = groupWikiConcepts([
      row({ id: 'p1', type: 'Project', title: 'P' }),
    ]);
    expect(unassignedSources).toEqual([]);
  });
});
