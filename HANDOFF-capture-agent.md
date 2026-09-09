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

## Local environment on a fresh machine — do this first

Nothing secret is in the repo, so the app will not start until this is done. Ask the user for values;
do not invent them and do not copy them into any tracked file. `.env.local` is gitignored.

**1. Install and generate.**

```bash
npm install
npx prisma generate
```

Node 25 is what the previous machine ran; the repo pins no engine.

**2. A local Postgres database.** The app is developed against local Postgres, never against the
hosted database.

```bash
createdb hub_ai
npx prisma migrate deploy      # 69 migrations
npm run db:seed                # optional but recommended — gives you a household, profiles,
                               # categories and tags to work against
```

The database is named **`hub_ai`**. (CLAUDE.md said `hub_ai_dev` for a while — that was wrong and has
been corrected. If you see `hub_ai_dev` anywhere else, it's stale.)

**3. Create `.env.local` at the repo root.** The **minimum to boot the app and do plan step 2**:

```
DATABASE_URL="postgresql://<your-os-user>@localhost:5432/hub_ai"
SKIP_AUTH="true"
NEXT_PUBLIC_SKIP_AUTH="true"
```

That is genuinely enough. Stack Auth is _not_ configured locally and doesn't need to be — the two
skip flags stand in for a login, and the app serves a fixed dev user. Those two must always be set
or unset **together** (see the note in CLAUDE.md; a mismatch makes the browser think it's signed in
while the server disagrees, and you land in a broken onboarding loop).

**To exercise the scoped agent tokens, add whichever you're using:**

```
AGENT_TASKS_TOKEN="..."     # create tasks           (new this session; user may not have made one yet)
AGENT_PAGES_TOKEN="..."     # read + write pages     (needed for plan step 2 testing)
AGENT_READ_TOKEN="..."      # read-only agent reads  (needed for plan step 3)
API_SECRET="..."            # full-access admin; every resolver above also accepts it
```

Any 32-char random string works locally (`openssl rand -hex 16`) — these are compared against your
own env, not a remote service. Use the real values only when talking to the deployed app.

**The rest of the previous machine's `.env.local` is optional.** Verified by grepping the source, not
assumed:

- Actually read by app code, but only by features this work doesn't touch: `ALPHA_VANTAGE_API_KEY`
  (stock prices, 1 call site), `MONEYTOR_API_TOKEN` (account sync, 3 call sites), `BACKUP_TOKEN`
  (the scheduled Drive backup endpoint).
- **Dead — zero references anywhere in the repo:** `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (leftovers from before the move to Stack Auth),
  `RESEND_API_KEY`, and `GITHUB_PERSONAL_ACCESS_TOKEN` (that one is editor/MCP config, not app
  config). Don't bother recreating these, and don't be misled by seeing them in CLAUDE.md's env list.

Leave all of the above out unless something you need actually complains.

**4. Run it.**

```bash
npm run dev        # already binds 3001 — do NOT pass `-- -p 3001`, you get a duplicated flag
```

**5. Confirm the environment is actually right** before writing code:

```bash
curl -s localhost:3001/api/debug-auth | python3 -m json.tool
```

Expect `database.connected: true`, a non-zero `userCount`, and `currentUser` showing the dev user.
`stackUser: null` with a "client not initialised" note is **correct** here, not a failure. If
`currentUser` is null while the skip flags are set, the environment is wrong — stop and fix it.

**Testing a token path locally has a catch:** with the skip flags on, a session is always present and
short-circuits the token path, so a bearer token proves nothing. To genuinely exercise it, start the
server with the skip flags emptied (`SKIP_AUTH= NEXT_PUBLIC_SKIP_AUTH= npm run dev`); unauthenticated
requests then 401 and the token resolver takes over. That's how the create-only boundary was verified
this session.

**Never point anything at the hosted production database.** It is read-only for agents — see the
database-safety section of CLAUDE.md, which lists the host identifiers to check.

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
