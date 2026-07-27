'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useWikiPrompt, useUpdateWikiPrompt, type WikiPromptResponse } from '@/lib/hooks/use-wiki';

/**
 * Two-layer render: the outer component blocks on the initial fetch so
 * the inner `Editor` can seed its useState with the fetched value at
 * mount time — avoiding an effect-driven `setState` (which the lint rule
 * `react-hooks/set-state-in-effect` correctly flags as cascading).
 */
export function WikiPromptSettings() {
  const { data, isLoading, error } = useWikiPrompt();

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Wiki system prompt</p>
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
      </div>
    );
  }
  return <Editor data={data} />;
}

function Editor({ data }: { data: WikiPromptResponse }) {
  const update = useUpdateWikiPrompt();
  const [draft, setDraft] = useState(data.prompt ?? '');

  const dirty = draft !== (data.prompt ?? '');

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Wiki system prompt</p>
      <p className="text-muted-foreground text-xs">
        Passed as the system message when the LLM ingests a new source. Leave blank to inherit the
        built-in default (shown as placeholder).
      </p>

      <Textarea
        placeholder={data.defaultPrompt}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={update.isPending}
        className="min-h-[220px] font-mono text-xs"
      />

      <div className="flex items-center justify-end gap-2">
        {update.isError && (
          <span className="text-destructive text-xs">{(update.error as Error).message}</span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || update.isPending}
          onClick={() => setDraft(data.prompt ?? '')}
        >
          Reset
        </Button>
        <Button
          size="sm"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate(draft.trim() ? draft : null)}
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
    </div>
  );
}
