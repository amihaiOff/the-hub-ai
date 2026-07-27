# Hub AI — Design System & UI Guidelines

**This is the single source of truth for visual/UI decisions. Read it before
implementing any UI or design feature.** Tokens live in `app/globals.css`;
primitives live in `components/ui/` (shadcn/ui). Style with the semantic tokens
below — **never hard-code hex values** in components.

## Principles

- **Mobile-first** — design for mobile, enhance for desktop.
- **Dark mode is primary** — light mode is secondary. Warm/cool slate, not
  near-black.
- **Clean, minimal, data-driven** — financial numbers must read clearly; avoid
  clutter and decorative noise.
- **Token-driven** — use `bg-background`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-primary`, etc. Add/adjust
  colors as tokens in `globals.css`, not inline hex.
- **Professional, not playful** — subtle motion (200–300ms), no gratuitous
  animation.

## Color tokens

Semantic tokens resolve per theme in `app/globals.css` (`:root` = light,
`.dark` = primary). Dark values:

| Token                            | Hex                                               | Use                                                   |
| -------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `background`                     | `#2A2F3A`                                         | App base (mid-dark so soft shadows read)              |
| `card` / `popover`               | `#373E4C`                                         | Surface 1 — cards, popovers (lifts off base)          |
| `secondary` / `muted` / `accent` | `#424A59`                                         | Surface 2 — chips, filled buttons, hover, muted fills |
| `foreground`                     | `#FFFFFF`                                         | Primary text                                          |
| `muted-foreground`               | `#A0AEC0`                                         | Secondary text, labels, captions                      |
| `border` / `input`               | `#4A5162`                                         | Dividers, edges (slightly lighter than surfaces)      |
| `primary`                        | `#A8CAFF`                                         | Pastel blue — buttons, links, active state            |
| `primary-foreground`             | `#2A2F3A`                                         | Text on primary                                       |
| `destructive`                    | `#F5A5A5`                                         | Pastel red — destructive actions, losses              |
| `ring`                           | `#A8CAFF`                                         | Focus ring                                            |
| `sidebar`                        | `#232732`                                         | Sidebar (slightly darker than base)                   |
| charts 1–5                       | `#A8CAFF` `#8FDDB0` `#F5CD85` `#C9B8F7` `#F5A5A5` | Recharts series                                       |

- **Gains = green `#8FDDB0`, losses = red `#F5A5A5`.**
- **Light mode (secondary):** white / `#F9FAFB` backgrounds, `#111827` text,
  `#3B82F6` accent, `#10B981` success, `#EF4444` danger.

## Radius

`--radius: 0.75rem`. Scale (Tailwind): `rounded-lg` = 0.75rem, `-xl` = +4px,
`-2xl` = +8px, `-3xl` = 24px, `-4xl` = +16px.

- **Cards: `rounded-3xl` (24px).** Dialogs/sheets: `rounded-3xl`.
- Buttons, inputs, chips, small controls: `rounded-lg` / `rounded-xl`.

## Shadows (dark)

Soft drop shadows lift surfaces off the dark base (utilities in `globals.css`):

- `.shadow-glow` — `0 10px 30px rgba(0,0,0,.45)` — **default `Card` shadow**.
- `.shadow-glow-sm` — `0 4px 14px rgba(0,0,0,.35)`.
- `.shadow-glow-lg` — `0 20px 48px rgba(0,0,0,.5)`.

Cards carry a border **and** a shadow in dark mode (both, not either/or).

## Typography

- **Sans / body / headings: Lexend** (`--font-sans`, `--font-heading`).
- **Wordmark only: Playfair Display** (`--font-playfair`) — used _exclusively_
  for the "The Hub" wordmark, nowhere else.
- **Mono:** `--font-mono` (code / editor code blocks).
- **Numbers: tabular figures** (`font-variant-numeric: tabular-nums`) for aligned
  columns; compact `K`/`M` notation on summary cards.
- **Page titles:** every non-Areas page uses a `.page-title` heading at
  `text-4xl` in the base font. `.page-title { margin-bottom: 2.5rem }`; when the
  title shares a flex row with an action, the gap goes on the row (`mb-10`), not
  the title.

## Components

Build on **shadcn/ui** primitives in `components/ui/`; shared business
components in `components/shared/`.

- **Card** (`components/ui/card.tsx`): `bg-card text-card-foreground border
border-border rounded-3xl shadow-glow`, `py-6`, header/content/footer `px-6`,
  `gap-6`.
- **Buttons:** primary = `bg-primary` / `text-primary-foreground`; secondary /
  ghost / outline; destructive = red. Subtle hover (opacity/darken), 200–300ms.
- **Forms:** labels above inputs, clear bordered inputs, inline validation
  (green check valid / red message error).
- **Charts:** Recharts using `chart-1…5` tokens, subtle grid, hover tooltips,
  responsive to container.

## Layout & responsive

- **Mobile (< 768px):** single column, full-width cards, hamburger menu, bottom
  tab bar for primary sections.
- **Desktop (≥ lg / 1024px):** fixed left sidebar (`lg:ml-64`), responsive grid
  (2–3 cols), charts full width.
- Breakpoints: mobile 0–767, tablet 768–1023, desktop 1024+.
- **Safe areas:** `.safe-pt` / `.safe-pb` / `.safe-px` add notch / home-indicator
  insets (`env(safe-area-inset-*)`) on top of existing padding.
- **No horizontal overflow:** the shell `<main>` uses `overflow-x-clip`; wide
  children (tables, full-bleed blocks) must scroll inside their own container,
  never widen the viewport (it breaks fixed positioning on mobile).
- **RTL:** Areas pages auto-direct per block (`dir="auto"`); use
  `padding-inline` / `border-inline-start`, not left/right.

## Mobile / PWA specifics

- Installable PWA (`display: standalone`); `theme_color` / `background_color`
  `#2a2f3a`; `viewport-fit: cover`.
- **Fixed bottom bars differ by context:** in a browser tab a fixed bottom
  clearance clears the browser toolbar; in an installed PWA only the home
  indicator applies. Use display-mode-aware padding (see `.page-tab-bar-pb`) and
  portal viewport-fixed bars to `document.body`.

## Related skills (technique, not project law)

`.claude/skills/`: `mobile-first-ui`, `minimalist-ui`, `high-end-visual-design`,
`design-taste-frontend`. Use them for general craft; **this doc governs the
project's specific tokens, components, and conventions.**
