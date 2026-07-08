'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface KeyState {
  hasKey: boolean;
  maskedKey: string | null;
}

export function AiCategorizationSettings() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');

  const key = useQuery({
    queryKey: ['settings', 'anthropic-key'],
    queryFn: async () => {
      const res = await fetch('/api/settings/anthropic-key');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data as KeyState;
    },
  });

  const save = useMutation({
    mutationFn: async (apiKey: string | null) => {
      const res = await fetch('/api/settings/anthropic-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['settings', 'anthropic-key'] });
    },
  });

  const hasKey = key.data?.hasKey;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">AI auto-categorization</p>
        <p className="text-muted-foreground text-xs">
          Anthropic API key used to suggest categories for uncategorized transactions. The key is
          stored for your household and never shown again after saving. The query log lives under{' '}
          <span className="font-medium">Labs → AI Categorization</span>.
        </p>
      </div>

      {hasKey && !save.isPending && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Check className="h-3.5 w-3.5 text-green-500" />
          <span>Key set ({key.data?.maskedKey})</span>
          <button
            type="button"
            onClick={() => save.mutate(null)}
            className="text-red-500 hover:underline"
          >
            Remove
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          // Plain text (not a password field) so pasting works reliably across
          // browsers and mobile; the key is masked once saved.
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // Belt-and-suspenders: some environments swallow the default paste →
          // set the value explicitly from the clipboard.
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text) {
              e.preventDefault();
              setDraft(text.trim());
            }
          }}
          placeholder={hasKey ? 'Replace key…' : 'sk-ant-…'}
          className="max-w-xs text-sm"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button
          size="sm"
          onClick={() => save.mutate(draft.trim())}
          disabled={!draft.trim() || save.isPending}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
      {save.isError && <p className="text-xs text-red-500">{(save.error as Error).message}</p>}
    </div>
  );
}
