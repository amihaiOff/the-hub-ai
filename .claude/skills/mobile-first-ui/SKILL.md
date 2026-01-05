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

## Checklist

- [ ] Works on 320px width
- [ ] Dark mode looks correct
- [ ] Touch targets 44px minimum
- [ ] Numbers use tabular figures
- [ ] Charts readable on mobile
- [ ] Expensive functions memoized with useCallback
