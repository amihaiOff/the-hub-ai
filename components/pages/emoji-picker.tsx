'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// A pragmatic curated set — enough variety for page icons without pulling in a
// heavy full emoji-picker dependency. Users can also paste any emoji via the
// input at the top.
const EMOJIS = [
  '📓',
  '📄',
  '📝',
  '📌',
  '📎',
  '🗂️',
  '📁',
  '🗒️',
  '📊',
  '📈',
  '✅',
  '⭐',
  '🔥',
  '💡',
  '🎯',
  '🚀',
  '🏠',
  '🛒',
  '💰',
  '💳',
  '🏦',
  '🧾',
  '📅',
  '⏰',
  '🔒',
  '🔑',
  '❤️',
  '👨‍👩‍👧‍👦',
  '🐶',
  '🐱',
  '🍎',
  '🍕',
  '☕',
  '✈️',
  '🚗',
  '🏥',
  '💊',
  '🎓',
  '🎁',
  '🎉',
  '🌱',
  '🌍',
  '☀️',
  '🌙',
  '⚡',
  '🎵',
  '📷',
  '🛠️',
  '⚙️',
  '🔧',
];

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

  const pick = (emoji: string | null) => {
    onSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent align="start" className="w-64 rounded-2xl p-3">
        <input
          autoFocus
          defaultValue=""
          placeholder="Type or paste an emoji…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = (e.target as HTMLInputElement).value.trim();
              if (v) pick([...v][0] ?? v);
            }
          }}
          className="border-border/60 focus:ring-primary/40 mb-3 h-8 w-full rounded-lg border bg-transparent px-2 text-sm outline-none focus:ring-1"
        />
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => pick(e)}
              className={cn(
                'hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none transition-colors',
                value === e && 'bg-muted'
              )}
            >
              {e}
            </button>
          ))}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="text-muted-foreground hover:text-foreground mt-3 w-full text-left text-xs"
          >
            Remove icon
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
