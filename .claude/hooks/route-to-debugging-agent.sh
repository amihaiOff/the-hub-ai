#!/bin/bash
# UserPromptSubmit hook: when the user reports a problem, nudge Claude to
# investigate with debugging-agent BEFORE writing a fix. Emits nothing when
# the prompt looks like a normal feature request or question.
#
# The harness pipes {"prompt": "..."} on stdin. Anything we print to stdout
# becomes an additional system reminder injected into Claude's context.
set -euo pipefail

prompt="$(jq -r '.prompt // ""' 2>/dev/null || cat)"

# Lowercase for keyword matching; keep original for the reminder.
lower="$(printf %s "$prompt" | tr '[:upper:]' '[:lower:]')"

# Problem-signal keywords. Kept intentionally broad — false positives (a
# nudge on a feature request) are cheap; false negatives (skipping debug
# on a real bug) are the failure mode we care about.
patterns=(
  "there's a problem"
  "theres a problem"
  "there is a problem"
  "there's a bug"
  "theres a bug"
  " bug "
  "^bug "
  " bug$"
  "broken"
  "not working"
  "doesn't work"
  "does not work"
  "isn't working"
  "isnt working"
  " fails"
  "failed"
  "failing"
  "error"
  "crash"
  "wrong"
  "not right"
  "regression"
  "went away"
  "missing"
  "disappear"
  "stops working"
  "stopped working"
  "won't"
  "wont "
  "can't"
  "cant "
  "issue with"
  "there's an issue"
  "theres an issue"
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
The user reported a problem (keyword match: "$matched"). Before writing
any fix, launch the debugging-agent to root-cause the issue: read
relevant files, check logs, reproduce the bug, and identify the
underlying cause. Only start editing code after you've established
what's actually broken and why. Skip debugging-agent only if the fix
is genuinely trivial (a typo, a one-line CSS tweak) OR if you've
already been in the codebase this session and have full context.

Use the Agent tool with subagent_type="debugging-agent" and a self-
contained prompt that includes the user's report, any reproduction
you've observed, and which files/logs to start from.
</system-reminder>
EOF
