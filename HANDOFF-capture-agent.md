# Handoff — Capture Agent (LangGraph practice build)

**Branch:** `develop` (clean, pushed). This doc and the plan are committed at the repo root so they
travel between machines.
**Approved plan:** `./PLAN-capture-agent.md` — read this first; it is the contract. Written in
product terms deliberately (see Communication below).

## Where the work is

Steps 1 and the auth prerequisite are **done, committed, pushed to `develop`**. Read the two commit
messages for the reasoning — they are detailed and not duplicated here:

- `acde899 feat(tasks): scoped agent token for filing tasks`
- `aed7736 fix(auth): never bypass authentication in production`

**Next up: plan step 2 — the structured page-write endpoint.** This is the largest and most
important app-side piece. Nothing has been started on it.

## Design decisions already locked (do not re-litigate)

The user answered these explicitly. Re-opening them will annoy them.

| Question          | Decision                                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which agent       | "Capture agent": phone brain-dump → routed to tasks / page notes / db rows                                                                                                                                                                   |
| Language          | **Python** LangGraph (not JS), in this repo                                                                                                                                                                                                  |
| Hosting           | **A second Vercel project**, Root Directory `services/capture-agent`, NOT Vercel Services (permission-gated + would force this project's top-level `buildCommand` with `prisma migrate deploy` into a service = risk to the live app deploy) |
| Checkpointer      | `langgraph-checkpoint-postgres` on a **dedicated Neon branch**, from the start                                                                                                                                                               |
| Approval          | **Always wait.** Nothing written until the user ticks a box. `interrupt()` is load-bearing                                                                                                                                                   |
| Reporting surface | A dedicated "Inbox" Areas page; **the agent creates the page + db block itself if missing**                                                                                                                                                  |
| App access        | HTTP + bearer tokens only. Never direct Prisma/SQL on app tables                                                                                                                                                                             |
| Task token scope  | **Create-only.** Narrowed after review — edit/delete stay session-only                                                                                                                                                                       |

## Constraints discovered by exploration — trust these, they were verified

1. **Page content is unvalidated.** The page-content validator is `z.unknown()` with only a ~1MB size
   cap; the editor "owns its shape". A malformed ProseMirror doc is persisted happily and then fails
   to render, breaking that page in the UI. **This is the entire reason step 2 exists** — the agent
   must never compose page documents.
2. **`select` cells store the option _id_, not the label**; `multiselect` stores an array of option
   ids; `date` stores an ISO string. If the write endpoint doesn't translate label → id server-side,
   cells render blank and look like data loss.
3. **The db-block runtime helpers live in a client module** that imports Tiptap and
   `ReactNodeViewRenderer`. Existing `lib/pages/*` consumers only use `import type` (erased). An API
   route needs the runtime helpers, so extract them to a pure module first and re-export for the
   ~3 client callers + 1 test.
4. **Read-modify-write collision on the Inbox page is real.** The editor autosaves the whole
   document as the user types; so does the agent. Plan mitigations: compare-and-swap on the tab's
   `updatedAt` (agent loses with a 409 and retries), give the agent its own tab, and re-read on the
   next collect pass. The editor itself has no such check — out of scope, flagged to the user.
5. **Deletes and page _sections_ are session-only** and ignore the Authorization header entirely —
   no bearer token reaches them. Mirror that asymmetry for anything new.
6. **Preview deployments bypass auth**, so preview requests always arrive as a logged-in dev user and
   the scoped-token code path never runs there. To exercise a token-driven agent against preview, the
   auth-skip flag must be unset in the Vercel preview environment. Documented in `CLAUDE.md`.
7. **Vercel Python supports 3.12 / 3.13 / 3.14 only.** The repo pins 3.11 for its scripts, so the
   service needs its own version pin. Root `pyproject.toml` also has `requires-python = "^3.9"`,
   which is invalid PEP 621 and should be corrected.
8. `GET /api/tasks` has **no `done` filter and no pagination**, and narrows to owner-or-shared. The
   plan's compact read endpoint exists partly to work around this.

## Gotchas that cost time this session

- **Existing "401 when unauthenticated" route tests were passing for the wrong reason.** With both
  auth paths mocked and reset per test, an unmocked resolver returns `undefined` (falsy), so a route
  401s whether it checks the session or the token. When adding a token path, assert the negative by
  making the token path **succeed** and still expecting 401. Several such tests were fixed.
- Do **not** `Read`/tail a subagent's `.output` file — it is the full JSONL transcript and floods
  context. Wait for the completion notification.
- The pre-commit hook runs Prettier repo-wide and will reformat unrelated untracked files (it touched
  another session's in-progress skill files). Harmless but startling.
- Multiple agent sessions push to `develop` concurrently — `git fetch` + rebase before pushing.

## Open items for the user (not blocking step 2)

- Generate one `AGENT_TASKS_TOKEN` value; add locally and in the Vercel dashboard. (Not yet created —
  local smoke testing used the existing full-access admin secret instead, which the resolver also
  accepts.)
- The client-side auth-skip flag has no environment check of its own and must be toggled in lockstep
  with the server one. Flagged, deliberately not changed.
- Before plan step 5, the user owes ~15 real messy brain-dumps to tune prompts against. Do not invent
  substitutes.

## Mandatory workflow in this repo

`CLAUDE.md` requires: debug (if fixing a bug) → code → **test-agent + reviewer-agent, in parallel** →
done. Do not skip the test and review steps; both found real defects this session that unit tests and
type-checking did not. Also: ask before entering plan mode for anything with genuine tradeoffs.

**Verification standard the user expects:** unit tests are not sufficient on their own. Step 2 must be
verified by writing to a page and **opening it in a browser**. Live smoke tests against the running
app (port 3001) caught nothing this session but confirmed the security boundary end-to-end, which is
what made the change trustworthy. Local DB is `localhost` — safe to write. **Production Neon is
read-only; never write to it.**

## Communication

Invoke the **`plain-talk`** skill and follow it for every reply. This project is vibe-coded: the user
directs at product and system-architecture level and does not read code. No file names, function
names, or library names in responses — talk about app behaviour and consequences. Keep being specific
and honest about substance (say what's unverified, what you assumed, what you broke). The approved
plan file is written in that register; match it.

## Suggested skills

- **`plain-talk`** — mandatory, every response.
- **`mattpocock-skills:tdd`** — step 2's document-mutation logic is pure and table-driven; ideal
  red-green. This is the highest-value place in the whole build for tests-first.
- **`agent-browser`** — for the browser check that a written page still opens and edits.
- **`claude-api`** — read before writing any model-facing code (model ids, tool schemas, pricing).
  Its own trigger says read it before opening the file, not after.
- **`financial-validation`** — not relevant here; the capture agent touches no money paths.
- Later steps: **`vercel:env`** / **`vercel:vercel-cli`** for the second project and its variables;
  **`vercel-neon-compatibility`** before wiring the checkpointer (pooled Neon endpoints break
  prepared statements — read it, the plan flags this).
- **`error-recovery`** if the same failure repeats twice.
- Skip the UI/design skills (`impeccable`, `high-end-visual-design`, etc.) — a `UserPromptSubmit`
  hook keeps suggesting them on keyword matches like "design" or "layout", but this work is
  backend/agent and has no UI surface. Same for the debugging-agent reminder, which fires on words
  like "failed" in unrelated contexts.
