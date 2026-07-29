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
 * testable. Input order (updatedAt desc from the API) is preserved for sources;
 * projects are sorted by title for a stable heading order.
 */
export function groupWikiConcepts(rows: WikiConceptListRow[]): WikiGrouping {
  const projects = rows.filter((r) => r.type === 'Project');
  const knownProjectIds = new Set(projects.map((p) => p.id));

  const byProject = new Map<string, WikiConceptListRow[]>();
  const unassignedSources: WikiConceptListRow[] = [];

  for (const row of rows) {
    if (row.type === 'Project') continue;
    // A source counts as "assigned" only if its projectId points to a project
    // that still exists; a dangling id falls back to the top section.
    if (row.projectId && knownProjectIds.has(row.projectId)) {
      const arr = byProject.get(row.projectId) ?? [];
      arr.push(row);
      byProject.set(row.projectId, arr);
    } else {
      unassignedSources.push(row);
    }
  }

  const projectGroups: WikiProjectGroup[] = projects
    .map((project) => ({ project, sources: byProject.get(project.id) ?? [] }))
    .sort((a, b) => a.project.title.localeCompare(b.project.title));

  return { unassignedSources, projects: projectGroups };
}
