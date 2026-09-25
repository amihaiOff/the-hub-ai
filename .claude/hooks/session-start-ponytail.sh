#!/bin/bash
# SessionStart hook: make sure the ponytail skill (minimal/lazy code style,
# .claude/skills/ponytail/SKILL.md) gets loaded at the start of every
# session on this repo, rather than relying on the model to notice a
# trigger keyword on its own.
#
# Anything we print to stdout becomes a system reminder injected into
# Claude's context for the first turn.
set -euo pipefail

cat <<'EOF'
<system-reminder>
This repo has a "ponytail" project skill (.claude/skills/ponytail/SKILL.md)
that governs code shape for the rest of this session: YAGNI, reuse before
new code, shortest working diff, terse output. As your first action this
session — before any other tool call — invoke it with the Skill tool
(skill: "ponytail"). This does not replace CLAUDE.md's mandatory
Debug → Code → Test → Review workflow; ponytail governs *how* code is
written within that workflow, not whether the test/review steps happen.
</system-reminder>
EOF
