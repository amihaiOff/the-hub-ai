---
name: implement-app-tasks
description: Read the "for Claude" backlog from the Hub AI Areas page (via the app API, no MCP) and implement the tasks that are clear, after a whole-backlog pass for duplicates/consolidation/conflicts. Batches all open questions to the end.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Task
---

# Implement App Tasks (Hub AI "for Claude" backlog)

Fetch the app-improvement backlog the user maintains inside an **Areas page**
(a database block with a **"for Claude"** column) and implement the tasks that
are clear enough — analysing the whole backlog first, and saving every open
question for a single batch at the end.

## How to use

```
/implement-app-tasks
```

Or naturally: "Do the Claude tasks from the Areas page", "Work through the app backlog".

## Prerequisites (read the backlog over the API — no MCP)

The backlog is read from the deployed app:

- `HUB_AI_API_URL` — base URL. Defaults to `https://the-hub-ai-ten.vercel.app`.
- `HUB_AI_API_KEY` — the bearer token. Use the app's dedicated **read-only**
  `AGENT_READ_TOKEN` (preferred — it only unlocks these read endpoints); the
  full-access `API_SECRET` also works. Required.

If `HUB_AI_API_KEY` isn't set, stop and ask the user to provide it — don't guess.

## Step 1 — Fetch the backlog

```bash
curl -s "${HUB_AI_API_URL:-https://the-hub-ai-ten.vercel.app}/api/agent/backlog" \
  -H "Authorization: Bearer ${HUB_AI_API_KEY}"
```

The response is `{ success, data: { tasks, count } }` where each task is:

```jsonc
{
  "pageId": "…",
  "pageTitle": "Roadmap", // the Areas page it came from
  "rowId": "row_…",
  "title": "Add CSV export to portfolio", // the Name/Title column
  "fields": { "Notes": "…", "Priority": "High", "Status": "Todo" }, // other columns
  "pageContext": "…full text of the page…", // use this to understand the task
}
```

If `count` is 0, tell the user the backlog is empty and stop.

## Step 1.5 — Filter out tasks already marked as done

Before analysis, drop any task whose `fields` show it is already completed.
Consider a task done if **any** of the following holds:

- A field named `Done`, `Completed`, `Complete`, `Finished`, or `Shipped`
  (case-insensitive) is truthy — i.e. equals `true`, `"true"`, `"yes"`, `"y"`,
  `"done"`, `"✓"`, `"✔"`, or a checked-checkbox value.
- A field named `Status` or `State` (case-insensitive) has a value that
  case-insensitively matches `done`, `completed`, `complete`, `shipped`,
  `closed`, or `resolved`.

Skipped-as-done tasks are **not** analysed, implemented, or reported in the
end-of-run questions. Just count them and include a one-line "Skipped N tasks
already marked done" note in the final summary so the user can spot any
false-positives.

## Step 2 — Whole-backlog analysis FIRST (before writing any code)

Read **every** task together — title, `fields`, and `pageContext` — and classify:

1. **Clarity** — is the task specific enough to implement without guessing?
   Use `pageContext` for intent. If a task is **not clear enough, do NOT
   implement it** — mark it as "needs clarification", note exactly what's
   missing, and move on to the next task.
2. **Duplicates** — do any tasks ask for the same thing? Plan to do it once and
   note the duplicate.
3. **Consolidation** — can several tasks be done together as one change? Note
   the grouping.
4. **Conflicts** — do any tasks contradict each other (e.g. one says remove X,
   another extends X)? Do **not** implement conflicting tasks; record the
   conflict for the end questions.

Keep a running list of: tasks to implement, tasks skipped (unclear/conflicting),
and questions.

## Step 3 — Implement the clear, non-conflicting tasks

For each task that is clear and not blocked by a conflict, follow the full dev
workflow from `CLAUDE.md`:

- **Debug** (if it's a bug) — use `debugging-agent` to find the root cause.
- **Code** — implement the change.
- **Test** — run/instrument tests (`testing-agent`); verify it actually works.
- **Review** — `reviewer-agent` for quality/security.
- **Update spec** — `docs/the_hub_ai_spec.md` if behaviour changed.
- Commit per task with a clear message referencing the task title. Develop on
  the branch this session is scoped to; push per the repo's git rules.

Prefer running the testing/review agents in parallel, as CLAUDE.md instructs.

## Step 4 — Batch ALL questions at the end

After going through every task, present **one** consolidated section:

- **Needs clarification** — each unclear task + precisely what info is missing.
- **Conflicts** — each conflicting pair and why they can't both be done.
- **Consolidation suggestions** — tasks you'd merge, and how.
- **Done** — what you implemented (with commits/PR).

Do not ask questions mid-run — collect them and ask them all together here, so
the user can answer in one pass.

## Notes

- This is **read-only** against the backlog: the skill implements code but does
  not write status back into the page. Report progress in the final summary.
- Never invent requirements. Skipping an unclear task is the correct outcome —
  the end questions are how it gets unblocked.
