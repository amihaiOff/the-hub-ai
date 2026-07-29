import type { WikiConceptListRow } from '@/lib/hooks/use-wiki';

/** A project and the source concepts filed under it. */
export interface WikiProjectGroup {
  project: WikiConceptListRow;
  sources: WikiConceptListRow[];
}

export interface WikiGrouping {
  /** Non-project concepts with no (or a dangling) project — shown in the top section. */
  unassignedSources: WikiConceptListRow[];
  /** One group per project, including projects with zero sources, sorted by title. */
  projects: WikiProjectGroup[];
}

/**
 * Split the flat concept list into the top-level "no project" sources plus one
 * group per project. Pure + deterministic so the Wiki page's structure is unit
 * testable. A source can belong to several projects (many-to-many), so it
 * appears once under each of its projects; a source with no (or only dangling)
 * memberships lands in the top section. Input order (updatedAt desc from the
 * API) is preserved within each group; projects are sorted by title.
 */
export function groupWikiConcepts(rows: WikiConceptListRow[]): WikiGrouping {
  const projects = rows.filter((r) => r.type === 'Project');
  const knownProjectIds = new Set(projects.map((p) => p.id));

  const byProject = new Map<string, WikiConceptListRow[]>();
  const unassignedSources: WikiConceptListRow[] = [];

  for (const row of rows) {
    if (row.type === 'Project') continue;
    // Keep only memberships pointing at a project that still exists.
    const memberships = row.projectIds.filter((pid) => knownProjectIds.has(pid));
    if (memberships.length === 0) {
      unassignedSources.push(row);
      continue;
    }
    for (const pid of memberships) {
      const arr = byProject.get(pid) ?? [];
      arr.push(row);
      byProject.set(pid, arr);
    }
  }

  const projectGroups: WikiProjectGroup[] = projects
    .map((project) => ({ project, sources: byProject.get(project.id) ?? [] }))
    .sort((a, b) => a.project.title.localeCompare(b.project.title));

  return { unassignedSources, projects: projectGroups };
}
