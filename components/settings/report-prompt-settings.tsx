'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  useReportPrompt,
  useUpdateReportPrompt,
  type ReportPromptResponse,
} from '@/lib/hooks/use-budget';

/** Same two-layer pattern as WikiPromptSettings: seed the editor once loaded. */
export function ReportPromptSettings() {
  const { data, isLoading, error } = useReportPrompt();
  if (isLoading || !data) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        {error ? (
          <span className="text-destructive">{(error as Error).message}</span>
        ) : (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </>
        )}
      </p>
    );
  }
  return <Editor data={data} />;
}

function Editor({ data }: { data: ReportPromptResponse }) {
  const update = useUpdateReportPrompt();
  const saved = data.prompt ?? data.defaultPrompt;
  const [draft, setDraft] = useState(saved);
  const dirty = draft !== saved;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Monthly report prompt</p>
      <p className="text-muted-foreground text-xs">
        What the report agent is asked to do each month: its goals, how to work, and your household
        notes. Changes apply to the next report you generate.
      </p>

      <Textarea
        id="report-prompt"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={update.isPending}
        className="min-h-[360px] text-sm"
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {update.isError && (
          <span className="text-destructive text-xs">{(update.error as Error).message}</span>
        )}
        {update.isSuccess && !dirty && <span className="text-muted-foreground text-xs">Saved</span>}
        <Button
          size="sm"
          variant="ghost"
          disabled={draft === data.defaultPrompt || update.isPending}
          onClick={() => setDraft(data.defaultPrompt)}
        >
          Reset to default
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || update.isPending}
          onClick={() => setDraft(saved)}
        >
          Discard changes
        </Button>
        <Button
          size="sm"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate(draft)}
        >
          {update.isPending ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            'Save'
          )}
        </Button>
      </div>

      <details className="text-muted-foreground text-xs">
        <summary className="cursor-pointer">Fixed technical notes the app always adds</summary>
        <p className="mt-2">
          These describe the data files and how the report is handed back to the app, so they
          can&apos;t be edited.
        </p>
        <pre className="bg-muted mt-2 rounded-xl p-3 whitespace-pre-wrap">{data.contract}</pre>
      </details>
    </div>
  );
}
