# Capture Agent — a brain-dump inbox for the Hub

## Context

You want to practise building agentic systems, somewhere it's genuinely useful.
The money side of the Hub is already deterministic and well-served — its AI
does single, one-shot calls and that's the right tool. The places where things
actually rot are **Areas pages and Tasks**, and the friction there is capture:
a thought arrives while you're out, and filing it properly means opening the
app, choosing a page or a task category, and checking whether you've already
written it down.

**What we're building:** you send a messy brain-dump from your phone — typed or
a voice memo. Something reads it, splits it into separate thoughts, and works
out for each one whether it's a new task, a note that belongs on a page you
already have, a row for a table you already keep, or too vague to guess. It
checks what already exists first, so it doesn't hand you a fourth "call the
insurance guy". Then it writes **nothing**. It puts its suggestions in an Inbox
page as a table with an Approve checkbox, and waits. You tick what you want,
and it files those and only those.

**Why this shape is worth building:** the waiting is the interesting part. The
run genuinely pauses — you could approve it three days later from your phone
and it picks up exactly where it left off. And the set of things it needs to be
able to do (search your pages, search your tasks, make a task, add to a page,
add table rows) is the same set a "tidy up my task list every Sunday" agent
would need. This one earns that groundwork.

## Decisions made

|             |                                                                      |
| ----------- | -------------------------------------------------------------------- |
| Input       | Your phone posts a dump to a web address, no app UI needed           |
| Approval    | Nothing is ever written until you tick a box                         |
| Reporting   | A dedicated Inbox page: what it heard, what it suggests, what it did |
| Hosting     | Its own deployment, separate from the app, built from this same repo |
| Memory      | Its own dedicated database, physically separate from the Hub's       |
| Inbox setup | It creates the Inbox page and table itself on first run              |

## How it behaves

**When you send a dump:** you get an immediate acknowledgement with a link to
the Inbox — it doesn't make your phone wait around while it thinks. If the
same dump arrives twice (a double-tap, a flaky connection), the second one is
recognised and ignored rather than duplicated.

**What lands in the Inbox:** a dated entry with the dump written out verbatim,
so you can always see what it actually heard — this matters a lot for voice
memos. Below that, one table row per suggestion: a plain-language description,
what kind of thing it is, where it would go, and a note if it looks like
something you already have ("looks like your existing task 'call plumber'").
The Approve box starts **unticked**, always.

**When you tick boxes:** the next collection pass files exactly those, then
writes back into the same table whether each one worked. So the Inbox is the
whole audit trail — you never have to wonder what it did.

**When something goes wrong:** one failed item never stops the others. Each row
tells you what happened to it. If it can't make sense of a thought, it doesn't
guess — it becomes a question row for you to answer.

## Two things about your data I want to flag

**Duplicate detection is the weak spot**, honestly. It does a rough text match
to find candidates, then judges them properly. It'll reliably catch "call the
plumber" against "call plumber". It will _not_ reliably catch "call the plumber"
against "sort out the leak" — those are the same errand but share no words.
Two specific blind spots: your Hebrew/English mixing makes text matching much
weaker, and it only looks at your most recent few hundred open tasks. The
safety net is that suggestions arrive unticked, so a miss costs you a glance,
never a duplicate row.

**A collision risk on the Inbox page worth knowing about.** When you have a page
open, the editor saves the whole document as you type. So does the agent when
it writes results back. If you're sitting on the Inbox page at the moment it
writes, your editor could save its slightly-older copy over the top and erase
what the agent just wrote. I'm handling this three ways: the agent checks the
page hasn't changed since it read it and backs off if it has; it gets its own
tab on the Inbox page so it's never writing where you're typing; and the next
collection pass re-reads the page and repairs anything lost. The remaining gap
is that your editor has no such check — it can still win a race. Adding that
protection to the editor itself is a sensible follow-up, but it's a change to
how every page saves, so I'd rather not bundle it in here.

## Tasks created this way

Everything the agent creates will be owned by you as the household owner, not
by "the agent". Practically that means agent-created tasks show up in your Tasks
list immediately, exactly like ones you typed. Worth knowing: if a second
household member ever fires a dump, their tasks would land under your ownership
and be invisible in their own list. That's fine for now given who's using this,
and it's fixable later without redoing anything.

## Build order

Each of the first three steps is useful and safe on its own, and none of them
touch how the app currently behaves.

1. **Let the agent create tasks at all.** Right now nothing outside a logged-in
   browser can create a task — the pages side already has this, the tasks side
   doesn't. Adding it with the same narrow scope: create and edit only, never
   delete, and it can't invent new categories or tags. Also fixing a rough edge
   while I'm there — sending a bad category currently gives an unhelpful server
   error instead of a clear message.

2. **A safe way to write into pages.** This is the important one. Page content
   is currently stored as an opaque blob that nothing validates, so anything
   that writes a malformed page would silently corrupt it and break that page in
   the editor. Rather than let the agent compose page content directly, it gets
   a narrow set of instructions it can ask for — add a paragraph, add a heading,
   add bullet points, add table rows, tick a table cell — and the app builds the
   actual content. The agent physically cannot express an invalid page. I'll
   verify this by writing a page and opening it in the browser, which is the
   only test that really counts.

3. **A single place to read the lay of the land.** One request that returns your
   page and tab titles, the shape of your tables, your open tasks, categories,
   tags and household members. Without it the agent needs a request per page
   just to see what's there. This also has to read across the whole household
   rather than one person's view, or the duplicate checking would be blind to
   half your tasks.

4. **Prove the deployment cheaply.** A hello-world Python endpoint on its own
   deployment before any real work goes into it. Its own dedicated database gets
   set up here too.

5. **The agent itself, in two halves.** First the thinking half — split the dump,
   search for matches, decide, validate — running in a mode where it shows you
   what it _would_ do and writes nothing. Once that's making sensible calls, the
   second half: publishing to the Inbox, the pause, and the approve-and-file
   pass.

6. **Wire up your phone**, then run it for a week with everything defaulting to
   unticked before trusting it.

## How we'll know it works

The real test is step 2 checked in a browser — writing to a page and confirming
it still opens and edits normally. Beyond that: the app-side additions get unit
tests in the usual way; the agent gets its own tests for the parts that are pure
logic (does it correctly refuse a made-up category, does it correctly downgrade
something it can't resolve into a question, does it pause where it should, does
running the same approval twice create one task or two). The quality of its
judgement isn't unit-testable — that needs a file of ~15 real dumps of yours and
you looking at what it proposes. Everything runs against the preview database
first, never production.

## What I need from you before step 5

Nothing blocking — steps 1 through 4 can proceed. When we get to the agent, I'll
want a handful of real brain-dumps from you (the messier the better) to tune
against, rather than examples I invent.
