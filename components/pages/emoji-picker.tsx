'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// A broad, browsable emoji bank grouped by category. Not the full Unicode set —
// but wide enough to pick a fitting page icon without a heavy dependency. The
// input at the top still accepts any typed/pasted emoji.
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys & people',
    emojis: [
      '😀',
      '😄',
      '😁',
      '😅',
      '😂',
      '🙂',
      '😉',
      '😊',
      '😍',
      '😘',
      '😜',
      '🤪',
      '🤓',
      '😎',
      '🥳',
      '🤩',
      '🤔',
      '🤨',
      '😐',
      '😴',
      '😌',
      '😔',
      '😢',
      '😭',
      '😤',
      '😠',
      '🤯',
      '😱',
      '🤗',
      '🤫',
      '🤥',
      '😶',
      '🙄',
      '😇',
      '🥰',
      '😋',
      '👍',
      '👎',
      '👏',
      '🙌',
      '🙏',
      '💪',
      '👋',
      '🤝',
      '✌️',
      '🤞',
      '👀',
      '🧠',
      '🫶',
      '👶',
      '🧒',
      '👨',
      '👩',
      '🧑',
      '👴',
      '👵',
      '👨‍👩‍👧‍👦',
      '👨‍💻',
      '👩‍💻',
      '🕺',
      '💃',
    ],
  },
  {
    label: 'Animals & nature',
    emojis: [
      '🐶',
      '🐱',
      '🐭',
      '🐹',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🐯',
      '🦁',
      '🐮',
      '🐷',
      '🐸',
      '🐵',
      '🐔',
      '🐧',
      '🐦',
      '🦆',
      '🦉',
      '🐴',
      '🦄',
      '🐝',
      '🦋',
      '🐢',
      '🐙',
      '🐠',
      '🐬',
      '🐳',
      '🐊',
      '🐘',
      '🦒',
      '🦓',
      '🌱',
      '🌲',
      '🌳',
      '🌴',
      '🌵',
      '🌸',
      '🌷',
      '🌹',
      '🌻',
      '🍀',
      '🍁',
      '🍄',
      '🌍',
      '🌙',
      '⭐',
      '🌟',
      '☀️',
      '🌈',
      '☁️',
      '⚡',
      '❄️',
      '🔥',
      '💧',
    ],
  },
  {
    label: 'Food & drink',
    emojis: [
      '🍎',
      '🍐',
      '🍊',
      '🍋',
      '🍌',
      '🍉',
      '🍇',
      '🍓',
      '🫐',
      '🍒',
      '🍑',
      '🥝',
      '🍅',
      '🥑',
      '🥦',
      '🥕',
      '🌽',
      '🥔',
      '🍞',
      '🧀',
      '🥚',
      '🍔',
      '🍟',
      '🍕',
      '🌭',
      '🥪',
      '🌮',
      '🍣',
      '🍜',
      '🍝',
      '🍲',
      '🍰',
      '🎂',
      '🍪',
      '🍫',
      '🍩',
      '☕',
      '🍵',
      '🧃',
      '🍺',
      '🍷',
      '🥂',
    ],
  },
  {
    label: 'Travel & places',
    emojis: [
      '🏠',
      '🏡',
      '🏢',
      '🏥',
      '🏦',
      '🏫',
      '🏨',
      '⛪',
      '🏰',
      '🗼',
      '🏝️',
      '⛰️',
      '🌋',
      '🏕️',
      '✈️',
      '🚀',
      '🚗',
      '🚕',
      '🚙',
      '🚌',
      '🚲',
      '🛵',
      '🚂',
      '🚆',
      '⛵',
      '🚤',
      '🗺️',
      '🧭',
      '📍',
      '🚦',
      '🌉',
      '🎡',
    ],
  },
  {
    label: 'Activities & objects',
    emojis: [
      '⚽',
      '🏀',
      '🏈',
      '🎾',
      '🏐',
      '🏓',
      '🎿',
      '⛷️',
      '🏂',
      '🏊',
      '🚴',
      '🧗',
      '🎯',
      '🎮',
      '🎲',
      '🎸',
      '🎹',
      '🎺',
      '🎻',
      '🥁',
      '🎵',
      '🎧',
      '🎤',
      '🎬',
      '📷',
      '📸',
      '📹',
      '🎨',
      '🖌️',
      '✏️',
      '🖊️',
      '📚',
      '📖',
      '📓',
      '📔',
      '📕',
      '📗',
      '📘',
      '📙',
      '📄',
      '📃',
      '📝',
      '📌',
      '📎',
      '🖇️',
      '📁',
      '🗂️',
      '🗒️',
      '📅',
      '📆',
      '⏰',
      '⏳',
      '🔔',
      '🔦',
      '💡',
      '🔒',
      '🔑',
      '🗝️',
      '🔧',
      '🔨',
      '🛠️',
      '⚙️',
      '🧰',
      '🧲',
      '🔬',
      '🔭',
      '💻',
      '🖥️',
      '⌨️',
      '🖱️',
      '📱',
      '☎️',
      '🖨️',
      '💾',
      '💿',
    ],
  },
  {
    label: 'Symbols & finance',
    emojis: [
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '💯',
      '✅',
      '☑️',
      '❌',
      '⭕',
      '❓',
      '❗',
      '⚠️',
      '🚫',
      '♻️',
      '⭐',
      '🌟',
      '🔥',
      '✨',
      '🎉',
      '🎊',
      '🎁',
      '🏆',
      '🥇',
      '🎖️',
      '💰',
      '💵',
      '💳',
      '🪙',
      '💎',
      '📈',
      '📉',
      '📊',
      '🧾',
      '🏷️',
      '🧮',
      '⚖️',
      '📌',
      '📢',
      '🔗',
      '🧩',
      '🎯',
      '🚩',
      '🏁',
    ],
  },
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
      <PopoverContent align="start" className="w-72 rounded-2xl p-3">
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
          className="border-border/60 focus:ring-primary/40 mb-2 h-8 w-full rounded-lg border bg-transparent px-2 text-sm outline-none focus:ring-1"
        />
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-muted-foreground/70 mb-1 px-0.5 text-[10px] font-semibold tracking-wider uppercase">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-1">
                {group.emojis.map((e, i) => (
                  <button
                    key={`${e}-${i}`}
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
            </div>
          ))}
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
