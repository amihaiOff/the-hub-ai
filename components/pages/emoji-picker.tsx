'use client';

import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { EMOJI_GROUPS, searchEmojis } from './emoji-data';

export function EmojiPicker({
  value,
  onSelect,
  className,
}: {
  value: string | null;
  onSelect: (emoji: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const pick = (emoji: string | null) => {
    onSelect(emoji);
    setQuery('');
    setOpen(false);
  };

  // Search results (flat) when there's a query; otherwise show the grouped
  // browse view. Recomputed only when the query changes.
  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchEmojis(query) : []), [query, searching]);

  // Enter picks the top search hit; if nothing matches but the user typed an
  // actual emoji, use that (so pasting a glyph still works).
  const commitTyped = () => {
    if (results.length > 0) {
      pick(results[0].char);
      return;
    }
    const v = query.trim();
    if (v && /\p{Extended_Pictographic}/u.test(v)) pick([...v][0] ?? v);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ? 'Change page icon' : 'Add page icon'}
          className={cn(
            'hover:bg-muted/60 flex items-center justify-center rounded-lg transition-colors',
            className
          )}
        >
          {value ? (
            <span className="leading-none">{value}</span>
          ) : (
            <span className="text-muted-foreground text-sm">Add icon</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-2xl p-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji (e.g. money, cat)…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTyped();
            }
          }}
          className="border-border/60 focus:ring-primary/40 mb-2 h-8 w-full rounded-lg border bg-transparent px-2 text-sm outline-none focus:ring-1"
        />
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {searching ? (
            results.length > 0 ? (
              <div className="grid grid-cols-8 gap-1">
                {results.map((e) => (
                  <button
                    key={e.char}
                    type="button"
                    onClick={() => pick(e.char)}
                    title={e.name}
                    className={cn(
                      'hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none transition-colors',
                      value === e.char && 'bg-muted'
                    )}
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                No emoji found for “{query.trim()}”. Press Enter to use a pasted emoji.
              </p>
            )
          ) : (
            EMOJI_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-muted-foreground/70 mb-1 px-0.5 text-[10px] font-semibold tracking-wider uppercase">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {group.emojis.map((e, i) => (
                    <button
                      key={`${e.char}-${i}`}
                      type="button"
                      onClick={() => pick(e.char)}
                      title={e.name}
                      className={cn(
                        'hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none transition-colors',
                        value === e.char && 'bg-muted'
                      )}
                    >
                      {e.char}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="text-muted-foreground hover:text-foreground mt-2 w-full text-left text-xs"
          >
            Remove icon
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
