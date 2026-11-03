'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CategoryIcon, loadLucideIcons, POPULAR_ICONS } from '@/components/tasks/category-icon';

/** Preset category colors (readable on the dark theme); null = default. */
export const CATEGORY_COLORS = [
  '#f5a5a5',
  '#f97316',
  '#f5cd85',
  '#eab308',
  '#8fddb0',
  '#8fd9b6',
  '#06b6d4',
  '#8fb4f5',
  '#a8caff',
  '#8b5cf6',
  '#ec4899',
  '#a1a1aa',
];

/**
 * Trigger showing the current icon (tinted with the category color); opens a
 * popover with a color-swatch row and a searchable grid of all lucide icons.
 */
export function AppearancePicker({
  icon,
  color,
  onIcon,
  onColor,
  label,
}: {
  icon: string | null;
  color: string | null;
  onIcon: (icon: string | null) => void;
  onColor: (color: string | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<string[]>([]);

  // Load the full lucide set the first time the picker opens (cached).
  useEffect(() => {
    if (!open || names.length) return;
    let active = true;
    loadLucideIcons().then((icons) => {
      if (active) setNames(Object.keys(icons));
    });
    return () => {
      active = false;
    };
  }, [open, names.length]);

  // Full set ordered popular-first, then everything else alphabetically. Shown
  // in full (no cap) — the grid is virtualized so ~1,600 icons stay smooth.
  const allOrdered = useMemo(() => {
    if (!names.length) return [];
    const present = new Set(names);
    const popular = POPULAR_ICONS.filter((n) => present.has(n));
    const popularSet = new Set(popular);
    return [...popular, ...names.filter((n) => !popularSet.has(n))];
  }, [names]);

  const normalized = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const results = normalized
    ? names.filter((n) => n.toLowerCase().includes(normalized))
    : // Before the set finishes loading, show the popular shortlist so the grid
      // isn't empty on first open.
      names.length
      ? allOrdered
      : POPULAR_ICONS;

  return (
    // `modal` so the popover registers its own scroll lock on top of the
    // Dialog's; otherwise the Dialog's react-remove-scroll (the popover
    // portals outside it) eats wheel/touch scroll and the icon grid can't
    // scroll.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="border-border/60 hover:bg-muted/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
        >
          <CategoryIcon name={icon} color={color} className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl p-2" align="start">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          className="placeholder:text-muted-foreground mb-2 h-8 w-full rounded-lg bg-black/20 px-2 text-sm outline-none focus:bg-black/30"
        />

        <IconGrid
          key={normalized}
          selected={icon}
          names={results}
          onPick={(name) => {
            onIcon(name);
            setOpen(false);
          }}
        />

        <div className="border-border/60 mt-2 border-t pt-2">
          {/* Color swatches — first is "default" (no color). */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-label="Default color"
              aria-pressed={!color}
              onClick={() => onColor(null)}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border text-[10px]',
                !color ? 'border-primary text-primary' : 'border-border text-muted-foreground'
              )}
            >
              —
            </button>
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => onColor(c)}
                style={{ backgroundColor: c }}
                className={cn(
                  'h-6 w-6 rounded-full ring-offset-1 transition-transform',
                  color === c ? 'ring-foreground ring-2' : 'hover:scale-110'
                )}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Windowed icon grid: only the rows near the viewport are rendered, so the
 * full lucide set (~1,600 icons) scrolls smoothly without mounting them all.
 */
const GRID_COLS = 6;
const ROW_HEIGHT = 40; // h-9 button (36px) + gap-1 (4px)
const VIEWPORT_HEIGHT = 208; // max-h-52
const OVERSCAN_ROWS = 3;

// The parent keys this on the search query, so a new search remounts it with a
// fresh scroll position (no reset effect / setState-in-effect needed).
function IconGrid({
  names,
  selected,
  onPick,
}: {
  names: string[];
  selected: string | null;
  onPick: (name: string) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);

  if (names.length === 0) {
    return (
      <div className="max-h-52 overflow-y-auto">
        <p className="text-muted-foreground py-4 text-center text-xs">No icons found.</p>
      </div>
    );
  }

  const rowCount = Math.ceil(names.length / GRID_COLS);
  const totalHeight = rowCount * ROW_HEIGHT;
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const lastRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN_ROWS
  );
  const visible = names.slice(firstRow * GRID_COLS, lastRow * GRID_COLS);

  return (
    <div
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="max-h-52 overflow-y-auto"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          className="grid grid-cols-6 gap-1"
          style={{ position: 'absolute', top: firstRow * ROW_HEIGHT, left: 0, right: 0 }}
        >
          {visible.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              aria-pressed={selected === name}
              title={name}
              onClick={() => onPick(name)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                selected === name
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <CategoryIcon name={name} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
