'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FolderKanban,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  useWikiConcept,
  useReSummarize,
  useDeleteWikiConcept,
  useRemoveFromProject,
  useSubmitAttempt,
} from '@/lib/hooks/use-wiki';
import { WikiMarkdown } from '@/components/wiki/wiki-markdown';
import { AddToProjectDialog } from '@/components/wiki/add-to-project-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export default function WikiConceptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;
  const { data, isLoading, error } = useWikiConcept(id);
  const reSummarize = useReSummarize();
  const del = useDeleteWikiConcept();
  const removeFromProject = useRemoveFromProject();
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (error) {
    return <div className="text-destructive text-sm">{(error as Error).message}</div>;
  }
  if (!data) return null;

  const { summary, projectRelevance } = splitBody(data.body);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href="/wiki"
            className="text-muted-foreground hover:text-foreground -ml-1 flex items-center gap-1.5 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Wiki
          </Link>
          <h1 className="page-title mt-2 text-2xl font-bold tracking-tight lg:text-3xl">
            {data.title}
          </h1>
          {data.description && (
            <p className="text-muted-foreground mt-1 text-sm">{data.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="border-border/60 rounded-full border px-2 py-0.5">{data.type}</span>
            {data.projects.map((p) => (
              <span
                key={p.id}
                className="border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2"
              >
                <Link
                  href={`/wiki/${p.id}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <FolderKanban className="h-3 w-3" />
                  {p.title}
                </Link>
                <button
                  type="button"
                  aria-label={`Remove from ${p.title}`}
                  title="Remove from project"
                  // Disable only the chip that's mid-removal, not all of them.
                  disabled={
                    removeFromProject.isPending &&
                    removeFromProject.variables?.projectId === p.id
                  }
                  onClick={() =>
                    removeFromProject.mutate(
                      { conceptId: data.id, projectId: p.id },
                      {
                        onError: (e) =>
                          alert(e instanceof Error ? e.message : 'Failed to remove from project'),
                      }
                    )
                  }
                  className="hover:bg-primary/20 -my-0.5 rounded-full p-1.5 transition-colors disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {data.sourceUrl && (
              <a
                href={data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 underline underline-offset-2"
              >
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {data.type !== 'Project' && (
              <>
                <DropdownMenuItem onSelect={() => setAddProjectOpen(true)}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Add to project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onSelect={() => {
                reSummarize.mutate({ id: data.id });
              }}
              disabled={reSummarize.isPending || !data.sourceRaw}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', reSummarize.isPending && 'animate-spin')} />
              {reSummarize.isPending ? 'Regenerating…' : 'Re-summarize'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={async () => {
                if (!confirm(`Delete "${data.title}"? This cannot be undone.`)) return;
                await del.mutateAsync(data.id);
                router.push('/wiki');
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Summary */}
      <div className="border-border/60 rounded-lg border p-4 sm:p-6">
        <WikiMarkdown source={summary} />
      </div>

      {/* Project relevance */}
      {projectRelevance && (
        <div className="border-primary/40 bg-primary/5 rounded-lg border p-4 sm:p-6">
          <div className="text-primary mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <FolderKanban className="h-3.5 w-3.5" /> Project relevance
          </div>
          <WikiMarkdown source={projectRelevance} />
        </div>
      )}

      {/* Quiz */}
      {data.questions.length > 0 && <Quiz questions={data.questions} />}

      <AddToProjectDialog
        open={addProjectOpen}
        onOpenChange={setAddProjectOpen}
        conceptId={data.id}
        currentProjectIds={data.projects.map((p) => p.id)}
      />
    </div>
  );
}

/** Split the composed body into summary + optional project-relevance chunks. */
function splitBody(body: string): { summary: string; projectRelevance: string | null } {
  const marker = /\n#\s+Project relevance\s*\n/;
  const m = body.match(marker);
  if (!m || m.index == null) {
    // Strip a leading "# Summary" heading if present so the renderer doesn't
    // double-title the block (the card already has its own title).
    return { summary: body.replace(/^#\s+Summary\s*\n?/, ''), projectRelevance: null };
  }
  const summary = body.slice(0, m.index).replace(/^#\s+Summary\s*\n?/, '');
  const projectRelevance = body.slice(m.index + m[0].length);
  return { summary, projectRelevance };
}

// ─── Quiz component ────────────────────────────────────────────────────

interface QuizQuestion {
  id: string;
  orderIndex: number;
  question: string;
  options: string[];
  correctIdx: number;
  explanation: string;
}

function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, number | undefined>>({});
  const [submitted, setSubmitted] = useState(false);
  const submit = useSubmitAttempt();

  const complete = questions.every((q) => answers[q.id] != null);
  const score = questions.reduce((acc, q) => acc + (answers[q.id] === q.correctIdx ? 1 : 0), 0);

  const handleSubmit = async () => {
    // Fire and forget attempts to the server (already have local state).
    await Promise.all(
      questions.map((q) =>
        submit.mutateAsync({
          questionId: q.id,
          selectedIdx: answers[q.id] as number,
        })
      )
    );
    setSubmitted(true);
  };

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="border-border/60 space-y-4 rounded-lg border p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Test your understanding</h2>
        {submitted && (
          <div className="text-sm">
            Score:{' '}
            <span
              className={cn(
                'font-semibold',
                score === questions.length ? 'text-emerald-500' : 'text-amber-500'
              )}
            >
              {score}/{questions.length}
            </span>
          </div>
        )}
      </div>
      <ol className="space-y-4">
        {questions
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((q, i) => (
            <QuizItem
              key={q.id}
              index={i + 1}
              question={q}
              selected={answers[q.id]}
              submitted={submitted}
              onSelect={(idx) => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
            />
          ))}
      </ol>
      <div className="flex justify-end gap-2">
        {submitted ? (
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!complete || submit.isPending}>
            {submit.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        )}
      </div>
    </div>
  );
}

function QuizItem({
  index,
  question,
  selected,
  submitted,
  onSelect,
}: {
  index: number;
  question: QuizQuestion;
  selected: number | undefined;
  submitted: boolean;
  onSelect: (idx: number) => void;
}) {
  return (
    <li className="space-y-2">
      <div className="text-sm font-medium">
        <span className="text-muted-foreground mr-2">{index}.</span>
        {question.question}
      </div>
      <div className="grid gap-1.5">
        {question.options.map((opt, idx) => {
          const chosen = selected === idx;
          const isCorrect = idx === question.correctIdx;
          const showCorrect = submitted && isCorrect;
          const showWrong = submitted && chosen && !isCorrect;
          return (
            <button
              key={idx}
              type="button"
              disabled={submitted}
              onClick={() => onSelect(idx)}
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                'border-border/60',
                chosen && !submitted && 'border-primary/60 bg-primary/5',
                showCorrect && 'border-emerald-500/60 bg-emerald-500/10',
                showWrong && 'border-red-500/60 bg-red-500/10',
                !submitted && 'hover:bg-muted/40'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                  chosen && !submitted && 'border-primary bg-primary text-primary-foreground',
                  showCorrect && 'border-emerald-500 bg-emerald-500 text-white',
                  showWrong && 'border-red-500 bg-red-500 text-white',
                  !chosen && !showCorrect && !showWrong && 'border-border/60 text-muted-foreground'
                )}
              >
                {showCorrect ? (
                  <Check className="h-2.5 w-2.5" />
                ) : showWrong ? (
                  <X className="h-2.5 w-2.5" />
                ) : (
                  String.fromCharCode(65 + idx)
                )}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
      {submitted && (
        <div className="text-muted-foreground border-l-2 border-l-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
          <span className="text-foreground font-medium">Why: </span>
          {question.explanation}
        </div>
      )}
    </li>
  );
}
