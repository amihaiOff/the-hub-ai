'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIngestSource, useCreateProject, useWikiConcepts } from '@/lib/hooks/use-wiki';

type Mode = 'url' | 'paste';

export default function NewSourcePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [promptOverride, setPromptOverride] = useState('');

  const ingest = useIngestSource();
  const { data: concepts } = useWikiConcepts();
  const projects = (concepts ?? []).filter((c) => c.type === 'Project');
  const createProject = useCreateProject();

  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const canSubmit =
    !ingest.isPending && ((mode === 'url' && url.trim()) || (mode === 'paste' && rawText.trim()));

  const submit = async () => {
    const result = await ingest.mutateAsync({
      url: mode === 'url' ? url.trim() : undefined,
      rawText: mode === 'paste' ? rawText.trim() : undefined,
      projectId: projectId || null,
      promptOverride: promptOverride.trim() || undefined,
    });
    router.push(`/wiki/${result.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="page-title text-2xl font-bold tracking-tight lg:text-3xl">New source</h1>
        <p className="text-muted-foreground text-sm">
          Paste a URL, PDF-extracted text, or article body. The LLM writes an OKF-shaped summary and
          five comprehension questions.
        </p>
      </div>

      <div className="border-border/60 space-y-4 rounded-lg border p-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <ModeButton active={mode === 'url'} onClick={() => setMode('url')}>
            URL
          </ModeButton>
          <ModeButton active={mode === 'paste'} onClick={() => setMode('paste')}>
            Paste text
          </ModeButton>
        </div>

        {mode === 'url' ? (
          <div className="space-y-2">
            <Label htmlFor="url">Source URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
            <p className="text-muted-foreground text-xs">
              Server-side Readability extracts the article text. Paywalled pages may return nothing
              usable.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="raw">Source text</Label>
            <Textarea
              id="raw"
              placeholder="Paste the article body, chapter, or notes…"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="min-h-[240px] resize-y font-mono text-xs"
              autoFocus
            />
          </div>
        )}

        {/* Project select */}
        <div className="space-y-2">
          <Label>Project (optional)</Label>
          <div className="flex flex-wrap gap-2">
            <Select
              value={projectId || 'none'}
              onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}
            >
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[240px]">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick project create */}
          <details className="text-muted-foreground text-xs">
            <summary className="cursor-pointer">+ Create a new project</summary>
            <div className="mt-2 flex items-center gap-2">
              <Input
                placeholder="Project title, e.g. Agentic tools for DS"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!newProjectTitle.trim() || creatingProject}
                onClick={async () => {
                  setCreatingProject(true);
                  try {
                    const p = await createProject.mutateAsync({ title: newProjectTitle.trim() });
                    setProjectId(p.id);
                    setNewProjectTitle('');
                  } finally {
                    setCreatingProject(false);
                  }
                }}
              >
                {creatingProject ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </details>
          <p className="text-muted-foreground text-xs">
            When a project is set, the LLM adds a &ldquo;Project relevance&rdquo; section explaining
            how the source&apos;s ideas apply to that project.
          </p>
        </div>

        {/* Prompt override */}
        <details className="text-muted-foreground text-xs">
          <summary className="cursor-pointer">Override system prompt for this ingest</summary>
          <Textarea
            className="mt-2 min-h-[100px]"
            placeholder="Leave blank to use the household default (Settings → Wiki prompt)…"
            value={promptOverride}
            onChange={(e) => setPromptOverride(e.target.value)}
          />
        </details>

        <div className="flex items-center justify-end gap-3">
          {ingest.isError && (
            <span className="text-destructive text-xs">{(ingest.error as Error).message}</span>
          )}
          <Button onClick={submit} disabled={!canSubmit}>
            {ingest.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Summarizing…
              </>
            ) : (
              'Summarize'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
        (active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border/60 text-muted-foreground hover:bg-muted/50')
      }
    >
      {children}
    </button>
  );
}
