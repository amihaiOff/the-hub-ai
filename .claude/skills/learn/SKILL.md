---
name: learn
description: Record a new pattern, error solution, or lesson learned for future reference. Use when you discover a fix for an error, find a better approach, or want to document something for the team.
allowed-tools: Read, Edit
---

# Learn - Capture New Patterns

Record lessons learned so they can be incorporated into skills later.

## How to Use

When you discover something worth remembering:

```
/learn "Description of what was learned"
```

Or invoke naturally:

```
"Learn that Prisma P2024 means connection pool exhausted"
"Remember this fix for the hydration error"
"Add to learning log: always check cache before API call"
```

## What to Record

1. **Error patterns** - New errors and their solutions
2. **Better approaches** - More efficient ways to do things
3. **Gotchas** - Things that tripped you up
4. **Project-specific** - Hub AI quirks and fixes

## Your Task

When invoked, add an entry to `.claude/learning-log.md`:

1. Read the current learning-log.md
2. Determine the appropriate category:
   - `error-recovery` - General error handling patterns
   - `troubleshooting` - Hub AI specific issues
   - `financial` - Money/calculation related
   - `database` - Prisma/PostgreSQL issues
   - `api` - External API integration
   - `ui` - Frontend/styling issues
   - `notifications` - Alert system

3. Add a new entry with this format:

```markdown
### [Short Title]

- **Date**: YYYY-MM-DD
- **Category**: [category]
- **Problem**: [What went wrong or was suboptimal]
- **Solution**: [What fixed it or the better approach]
- **Skill**: [Which skill should be updated: error-recovery, hub-ai-troubleshooting, etc.]

---
```

4. Append to the `## Entries` section

## Example Entry

```markdown
### Prisma Connection Pool Exhausted

- **Date**: 2025-01-15
- **Category**: database
- **Problem**: P2024 error "Timed out fetching a new connection from the pool"
- **Solution**: Add `?connection_limit=5` to DATABASE_URL for serverless
- **Skill**: hub-ai-troubleshooting

---
```

## Important

- Keep entries concise but complete
- Include enough detail to recreate the solution
- Tag the correct skill for later incorporation
