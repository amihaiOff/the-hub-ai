---
name: mobile-first-ui
description: Build responsive UI components with dark mode support and mobile-first approach. Use when creating components, styling, ensuring responsive design, or working with Tailwind CSS and shadcn/ui.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Mobile-First UI Design for Hub AI

Guide for responsive, dark-mode-first UI development.

## Design Principles

1. **Mobile-first**: Design for mobile, enhance for desktop
2. **Dark mode primary**: Dark is default theme
3. **Color scheme**: Blue accents, green gains, red losses
4. **Typography**: Inter font, tabular figures for numbers

## Breakpoints

```
Mobile:  < 640px  (default styles)
Tablet:  sm: 640px
Desktop: md: 768px, lg: 1024px, xl: 1280px
```

## Tailwind Patterns

```tsx
// Mobile-first responsive
<div className="
  flex flex-col          // Mobile: stack
  sm:flex-row            // Tablet+: row
  gap-4
">

// Dark mode (primary)
<div className="
  bg-slate-900           // Dark default
  text-white
  dark:bg-slate-900      // Explicit dark
  light:bg-white         // Light override
">

// Financial colors
<span className="text-green-500">+$1,234</span>  // Gains
<span className="text-red-500">-$567</span>      // Losses

// Tabular figures for numbers
<span className="font-mono tabular-nums">$12,345.67</span>
```

## Layout Patterns

```tsx
// Mobile: single column, Desktop: sidebar + content
<div className="flex flex-col lg:flex-row">
  <aside className="w-full lg:w-64">Sidebar</aside>
  <main className="flex-1">Content</main>
</div>

// Mobile: bottom nav, Desktop: top nav
<nav className="
  fixed bottom-0 left-0 right-0
  lg:static lg:top-0
">
```

## shadcn/ui Components

Use shadcn/ui for consistency:

- `Button`, `Card`, `Input`, `Select`
- `Dialog`, `Sheet` (mobile-friendly modals)
- `Table` (with horizontal scroll on mobile)

## Performance Optimization

### Memoize Expensive Formatting Functions

Use `useCallback` for formatting functions that depend on props/state:

```tsx
// BAD: Function recreated on every render
const formatDisplayValue = (value: number): string => {
  if (displayCurrency !== baseCurrency && rates) {
    // expensive conversion logic
  }
  return formatValue(value, baseCurrency);
};

// GOOD: Memoized with dependencies
const formatDisplayValue = useCallback(
  (value: number): string => {
    if (displayCurrency !== baseCurrency && rates) {
      // expensive conversion logic
    }
    return formatValue(value, baseCurrency);
  },
  [displayCurrency, baseCurrency, rates, formatValue]
);
```

## Touch & Scroll (iOS gotchas)

### `touch-manipulation` beats `touch-pan-y` on tappable cards

Symptom: "first tap doesn't scroll — I have to lift and try again."
Cause: `touch-action: pan-y` still lets iOS Safari hold the initial touch
briefly to see if it's a double-tap-to-zoom gesture. On elements the user
taps (cards, list rows), use `touch-manipulation` instead — it allows
panning and pinch-zoom but disables the double-tap detection, so scroll
kicks in immediately on the first touch.

```tsx
// BAD — first tap sometimes doesn't scroll
<div className="touch-pan-y">…tappable card…</div>

// GOOD
<div className="touch-manipulation">…tappable card…</div>
```

### `@dnd-kit` sets `touch-action: none` on draggables

`useDraggable` / `useSortable` add `touch-action: none` via `setNodeRef` so
the browser doesn't hijack the pointer for scroll during a drag. Side
effect: **native scroll on that element is dead** even when no drag is
active. If the row needs to stay scrollable (e.g. touch-scrolling a list
of draggable cards on mobile), override with inline style:

```tsx
<div ref={setNodeRef} style={{ touchAction: 'pan-y' }} {...listeners}>
```

Combine with `TouchSensor({ activationConstraint: { delay: 220, tolerance: 8 } })`
so a long-press still activates the drag while short taps + swipes scroll
natively.

## Wide Tables — `table-layout: fixed` for real horizontal scroll

Symptom: table with `w-full` and many columns — cells collapse to fit the
viewport instead of overflowing horizontally.
Cause: default auto-layout distributes 100% width across columns; per-cell
`min-width` is a soft floor that browsers ignore when total content
exceeds the container. Result: no scroll, columns crammed.

Fix: `table-layout: fixed` with an explicit table width based on column
count. `min-w-full` keeps small tables filling the viewport.

```tsx
<div className="overflow-x-auto">
  <table
    className="min-w-full"
    style={{ tableLayout: 'fixed', width: `${columns.length * 10}rem` }}
  >
    {columns.map((c) => (
      <th key={c.id} style={{ width: '10rem' }}>
        …
      </th>
    ))}
  </table>
</div>
```

Style the scrollbar to match the theme (see `.database-block .overflow-x-auto`
in `app/globals.css` for the pattern).

## Checklist

- [ ] Works on 320px width
- [ ] Dark mode looks correct
- [ ] Touch targets 44px minimum
- [ ] Numbers use tabular figures
- [ ] Charts readable on mobile
- [ ] Expensive functions memoized with useCallback
