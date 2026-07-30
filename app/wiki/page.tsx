'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronRight, ExternalLink, FolderPlus, Plus } from 'lucide-react';
import { useWikiConcepts, type WikiConceptListRow } from '@/lib/hooks/use-wiki';
import { groupWikiConcepts, type WikiProjectGroup } from '@/lib/wiki/group';
import { NewProjectDialog } from '@/components/wiki/new-project-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function WikiPage() {
  const { data, isLoading, error } = useWikiConcepts();
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const { unassignedSources, projects } = useMemo(() => groupWikiConcepts(data ?? []), [data]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Title + actions (actions move to the top-right). */}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">Wiki</h1>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setNewProjectOpen(true)}
            aria-label="New project"
            title="New project"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
          <Button asChild size="icon" aria-label="New source" title="New source">
            <Link href="/wiki/new">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm">Loading…</div>}
      {error && <div className="text-destructive text-sm">{(error as Error).message}</div>}

      {data && data.length === 0 && (
        <div className="border-border/60 text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm">
          Nothing here yet.{' '}
          <Link href="/wiki/new" className="text-primary underline">
            Add your first source
          </Link>
          .
        </div>
      )}

      {/* Top section: sources not tied to any project. */}
      {unassignedSources.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Sources ({unassignedSources.length})
          </h2>
          <div className="grid gap-2">
            {unassignedSources.map((c) => (
              <SourceCard key={c.id} concept={c} />
            ))}
          </div>
        </section>
      )}

      {/* One collapsible group per project. */}
      {projects.map((group) => (
        <ProjectGroup key={group.project.id} group={group} />
      ))}

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}

/** A project's collapsible group: a label-only heading + a link to open the
 *  project page, with its source cards nested inside. */
function ProjectGroup({ group }: { group: WikiProjectGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold tracking-wider uppercase transition-colors">
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
          <span className="truncate">{group.project.title}</span>
          <span className="text-muted-foreground/60 shrink-0">({group.sources.length})</span>
        </CollapsibleTrigger>
        <Link
          href={`/wiki/${group.project.id}`}
          aria-label={`Open project ${group.project.title}`}
          title="Open project"
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 -m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <CollapsibleContent className="grid gap-2">
        {group.sources.length === 0 ? (
          <p className="text-muted-foreground/70 pl-5 text-xs">No sources yet.</p>
        ) : (
          group.sources.map((c) => <SourceCard key={c.id} concept={c} />)
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A source concept card: title (→ detail), external source link, and a
 *  collapsible one-line abstract. `min-w-0` + `break-words` keep long titles /
 *  descriptions wrapping inside the card instead of overflowing the viewport. */
function SourceCard({ concept }: { concept: WikiConceptListRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border-border shadow-glow-sm rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <BookOpen className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link
              href={`/wiki/${concept.id}`}
              className="hover:text-primary min-w-0 flex-1 font-medium break-words transition-colors"
            >
              {concept.title}
            </Link>
            {concept.sourceUrl && (
              <a
                href={concept.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open source in a new tab"
                title="Open source in a new tab"
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 -m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>

          {concept.description && (
            <Collapsible open={open} onOpenChange={setOpen} className="mt-1.5">
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors">
                <ChevronRight
                  className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
                />
                {open ? 'Hide abstract' : 'Abstract'}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="text-muted-foreground mt-1 text-xs break-words">
                  {concept.description}
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}
