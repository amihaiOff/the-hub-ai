---
name: implement-notion-tasks
description: Use Notion MCP to find tasks in the Hub AI tasks database with the Claude checkbox checked and implement them using the full dev workflow.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Task, ToolSearch, mcp__notion__notion-search, mcp__notion__notion-fetch, mcp__notion__notion-update-page
---

# Implement Notion Tasks

Automatically fetch tasks from the Hub AI Notion database and implement ones marked for Claude.

## How to Use

```
/implement-notion-tasks
```

Or naturally:

```
"Implement the Notion tasks marked for Claude"
"Check Notion for tasks and implement them"
```

## Your Task

### Step 1: Load Notion Tools

First, load the required Notion MCP tools:

```
ToolSearch: query="+notion search"
ToolSearch: query="+notion fetch"
```

### Step 2: Find the Hub AI Tasks Database

Use Notion search to find the "Hub AI Tasks" database:

```
mcp__notion__notion-search: query="Hub AI Tasks", filter_type="database"
```

### Step 3: Query Tasks with Claude Checkbox

Once you have the database ID, fetch pages from it and filter for tasks where:

- The "Claude" checkbox property is checked (true)
- Status is not "Done" or "Completed"

Use `notion-fetch` to get database contents:

```
mcp__notion__notion-fetch: resource_uri="notion://database/{database_id}"
```

### Step 4: For Each Task

For each task marked for Claude:

1. **Read the full page content**

   ```
   mcp__notion__notion-fetch: resource_uri="notion://page/{page_id}"
   ```

2. **Extract requirements** from:
   - Page title (task name)
   - Page body content (detailed requirements)
   - Any linked pages or references

3. **Implement the task** following the full dev workflow from CLAUDE.md:

   a. **Debug (if fixing a bug)** - Use `debugging-agent` to investigate root cause

   b. **Code** - Use `coding-agent` to implement the feature/fix

   c. **Test** - Use `testing-agent` to verify changes work

   d. **Review** - Use `reviewer-agent` to check code quality

   e. **Update Spec** - Update `docs/the_hub_ai_spec.md` if the feature/behavior changes

   Run test and review agents in parallel:

   ```
   Task: subagent_type="testing-agent", prompt="..."
   Task: subagent_type="reviewer-agent", prompt="..."
   ```

4. **Update task status in Notion** (optional, if you have write access):
   ```
   mcp__notion__notion-update-page: page_id="{page_id}", properties={"Status": "Done"}
   ```

### Step 5: Report Progress

After completing tasks, summarize:

- Which tasks were implemented
- What changes were made
- Any issues encountered
- Any tasks that couldn't be completed

## Example Workflow

```
1. Load Notion tools via ToolSearch
2. Search: "Hub AI Tasks" database
3. Found database ID: abc123
4. Fetch database pages
5. Found 3 tasks with Claude checkbox:
   - "Add dark mode toggle to settings"
   - "Fix pension deposit validation"
   - "Add export to CSV feature"

For "Add dark mode toggle to settings":
- Read full page content
- Requirements: Add toggle in settings page, persist to localStorage
- Code implementation with coding-agent
- Run testing-agent and reviewer-agent in parallel
- Update spec if needed
- Mark as done in Notion

... repeat for other tasks
```

## Important Notes

- **Always read the full page** - The title alone may not have enough detail
- **Follow the dev workflow** - Don't skip testing and review
- **One task at a time** - Complete each task fully before moving to the next
- **Handle failures gracefully** - If a task can't be completed, document why and move on
- **Update the spec** - If the task changes features or behavior, update the spec file

## Notion Property Names

The Hub AI Tasks database likely has these properties:

- **Claude** - Checkbox indicating task should be implemented by Claude
- **Status** - Select with values like "To Do", "In Progress", "Done"
- **Priority** - Priority level
- **Title** - Task name (page title)

Adjust property names if the actual database uses different names.
