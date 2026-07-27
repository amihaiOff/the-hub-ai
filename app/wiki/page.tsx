'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpen, ExternalLink, FolderKanban, Plus } from 'lucide-react';
import { useWikiConcepts, type WikiConceptListRow } from '@/lib/hooks/use-wiki';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function WikiPage() {
  const { data, isLoading, error } = useWikiConcepts();
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  const grouped = useMemo(() => groupConcepts(data ?? [], projectFilter), [data, projectFilter]);
  const projects = useMemo(() => (data ?? []).filter((c) => c.type === 'Project'), [data]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">Wiki</h1>
          <p className="text-muted-foreground text-sm">
            LLM-summarized sources and projects. Each source ships with five comprehension
            questions.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/wiki/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New source
          </Link>
        </Button>
      </div>

      {projects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={projectFilter === null}
            onClick={() => setProjectFilter(null)}
            label="All"
          />
          {projects.map((p) => (
            <FilterChip
              key={p.id}
              active={projectFilter === p.id}
              onClick={() => setProjectFilter(p.id)}
              label={p.title}
            />
          ))}
        </div>
      )}

      {isLoading && <div className="text-muted-foreground text-sm">Loading…</div>}
      {error && <div className="text-destructive text-sm">{(error as Error).message}</div>}

      {data && data.length === 0 && (
        <div className="border-border/60 text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Nothing here yet.{' '}
          <Link href="/wiki/new" className="text-primary underline">
            Add your first source
          </Link>
          .
        </div>
      )}

      {Object.entries(grouped).map(([type, rows]) => (
        <section key={type} className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {type} ({rows.length})
          </h2>
          <div className="grid gap-2">
            {rows.map((c) => (
              <ConceptRow key={c.id} concept={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/60 text-muted-foreground hover:bg-muted/50'
      )}
    >
      {label}
    </button>
  );
}

function ConceptRow({ concept }: { concept: WikiConceptListRow }) {
  const Icon = concept.type === 'Project' ? FolderKanban : BookOpen;
  return (
    <Link
      href={`/wiki/${concept.id}`}
      className="border-border/60 hover:bg-muted/40 flex items-start gap-3 rounded-lg border p-3 transition-colors"
    >
      <Icon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{concept.title}</span>
          {concept.sourceUrl && (
            <ExternalLink className="text-muted-foreground h-3 w-3 shrink-0" aria-hidden />
          )}
        </div>
        {concept.description && (
          <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
            {concept.description}
          </div>
        )}
      </div>
    </Link>
  );
}

function groupConcepts(
  rows: WikiConceptListRow[],
  projectFilter: string | null
): Record<string, WikiConceptListRow[]> {
  const filtered =
    projectFilter === null
      ? rows
      : rows.filter((r) => r.id === projectFilter || r.projectId === projectFilter);
  const out: Record<string, WikiConceptListRow[]> = {};
  for (const r of filtered) {
    (out[r.type] ??= []).push(r);
  }
  return out;
}
