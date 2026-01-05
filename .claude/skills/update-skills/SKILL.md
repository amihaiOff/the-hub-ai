---
name: update-skills
description: Incorporate entries from learning-log.md into the appropriate skill files. Use periodically to keep skills updated with recent learnings.
allowed-tools: Read, Edit, Glob
---

# Update Skills - Incorporate Learnings

Process the learning log and update skill files with new patterns.

## How to Use

Periodically run:

```
/update-skills
```

Or naturally:

```
"Update the skills with recent learnings"
"Incorporate the learning log into skills"
```

## Your Task

1. **Read the learning log**
   - Open `.claude/learning-log.md`
   - Identify all entries that haven't been processed

2. **Group by target skill**
   - `error-recovery` entries → `error-recovery/SKILL.md`
   - `troubleshooting` entries → `hub-ai-troubleshooting/SKILL.md`
   - `financial` entries → `financial-validation/SKILL.md`
   - `database` entries → `database-schema/SKILL.md`
   - `api` entries → `stock-api-integration/SKILL.md`
   - `ui` entries → `mobile-first-ui/SKILL.md`
   - `notifications` entries → `notification-system/SKILL.md`

3. **Update each skill file**
   - Read the target skill
   - Find the appropriate section (or create one)
   - Add the new pattern/solution in the skill's format
   - Keep the skill organized and readable

4. **Mark entries as processed**
   - Add `[INCORPORATED]` prefix to processed entries
   - Or move them to an "Archive" section

5. **Report what was updated**
   - List which skills were modified
   - Summarize what was added

## Skill File Locations

```
.claude/skills/
├── error-recovery/SKILL.md
├── hub-ai-troubleshooting/SKILL.md
├── financial-validation/SKILL.md
├── database-schema/SKILL.md
├── stock-api-integration/SKILL.md
├── mobile-first-ui/SKILL.md
└── notification-system/SKILL.md
```

## Integration Guidelines

When adding to skills:

### For error-recovery

Add to the "Common Errors & Solutions" table or create new category.

### For hub-ai-troubleshooting

Add under the relevant section (Auth, Database, API, UI, etc.)

### For other skills

Find the most relevant section or add a "Recent Learnings" section.

## Example Update

**Learning log entry:**

```markdown
### Hydration Mismatch with Date

- **Date**: 2025-01-15
- **Category**: ui
- **Problem**: Hydration error when rendering dates
- **Solution**: Use suppressHydrationWarning or format dates client-side only
- **Skill**: mobile-first-ui
```

**Added to mobile-first-ui/SKILL.md:**

````markdown
## Common Issues

### Hydration Mismatch with Dates

```tsx
// BAD - causes hydration mismatch
<span>{new Date().toLocaleDateString()}</span>;

// GOOD - client-side only
const [date, setDate] = useState<string>('');
useEffect(() => setDate(new Date().toLocaleDateString()), []);
```
````

```

## After Updating

Provide a summary:
```

Updated skills from learning log:

1. mobile-first-ui - Added hydration fix for dates
2. hub-ai-troubleshooting - Added P2024 connection pool solution

3 entries processed, 2 skills updated.

```

```
