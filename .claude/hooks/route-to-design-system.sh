#!/bin/bash
# UserPromptSubmit hook: when the user asks for UI/design work, nudge Claude to
# load the design system (docs/design-system.md) BEFORE writing any UI. Emits
# nothing for non-UI prompts.
#
# The harness pipes {"prompt": "..."} on stdin. Anything we print to stdout
# becomes an additional system reminder injected into Claude's context.
set -euo pipefail

prompt="$(jq -r '.prompt // ""' 2>/dev/null || cat)"

# Lowercase for keyword matching.
lower="$(printf %s "$prompt" | tr '[:upper:]' '[:lower:]')"

# Design/UI-signal keywords. Kept broad — a false positive (a nudge on a
# non-UI prompt) is cheap; the failure mode we care about is shipping UI
# that ignores the design system.
patterns=(
  " ui "
  " ux "
  "design"
  "styl"          # style, styling, stylesheet
  "css"
  "tailwind"
  "theme"
  "dark mode"
  "light mode"
  "color"
  "colour"
  "palette"
  "layout"
  "spacing"
  "padding"
  "margin"
  " gap "
  "font"
  "typograph"
  "heading"
  "card"
  "button"
  "modal"
  "dialog"
  "component"
  "responsive"
  "mobile"
  "shadow"
  "rounded"
  "radius"
  " icon"
  "animation"
  "transition"
  "redesign"
  "look and feel"
  "visual"
  "align"
  "screen"
)

matched=""
for p in "${patterns[@]}"; do
  if echo " $lower " | grep -qE "$p"; then
    matched="$p"
    break
  fi
done

[ -z "$matched" ] && exit 0

# Emit a system reminder. The harness passes stdout through as additional
# context in the next model turn.
cat <<EOF
<system-reminder>
This looks like UI/design work (keyword match: "$matched"). Before writing
or editing any UI, read docs/design-system.md — the single source of truth
for tokens, palette, radii, shadow scale, typography, and component specs.
Style with the semantic tokens it lists (bg-card, text-muted-foreground, …)
and never hard-code hex. Skip only if you've already loaded it this session
or the change is genuinely non-visual.
</system-reminder>
EOF
