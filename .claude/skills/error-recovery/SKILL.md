---
name: error-recovery
description: Handle errors, recognize repeated failures, and choose alternative approaches. Use when something fails, tests don't pass, builds break, or the same error occurs multiple times.
allowed-tools: Read, Grep, Glob, Bash
---

# Error Recovery for Hub AI

Guide for recognizing failures and adapting approaches instead of repeating them.

## Core Principle

**If something fails twice the same way, try a different approach.**

## Failure Recognition

### Signs You Should Change Approach

1. **Same error twice** - Don't retry identical code
2. **Test keeps failing** - Analyze why, don't just re-run
3. **Build error persists** - Read the error message carefully
4. **Timeout/hanging** - The approach may be fundamentally wrong
5. **Permission denied** - Need different strategy, not retry

### Decision Tree

```
Error occurs
    ↓
Is this the first occurrence?
    YES → Try to fix directly
    NO  → STOP. Analyze why it's repeating.
              ↓
         Is the error message the same?
              YES → Different approach needed
              NO  → Progress being made, continue fixing
```

## Common Hub AI Errors & Solutions

### Prisma Errors

| Error | Wrong Approach | Right Approach |
|-------|---------------|----------------|
| `P2002: Unique constraint` | Retry insert | Check for existing record first |
| `P2025: Record not found` | Retry query | Verify ID exists, handle null |
| `P2003: Foreign key constraint` | Force delete | Delete children first or cascade |
| Migration fails | Re-run same migration | Check schema, fix conflicts |

### Next.js Errors

| Error | Wrong Approach | Right Approach |
|-------|---------------|----------------|
| `Module not found` | Reinstall randomly | Check import path, file exists |
| Hydration mismatch | Add random keys | Find server/client difference |
| `NEXT_PUBLIC_` undefined | Restart dev server | Check `.env.local` file |
| API route 500 | Add more try/catch | Check logs, find root cause |

### TypeScript Errors

| Error | Wrong Approach | Right Approach |
|-------|---------------|----------------|
| Type mismatch | Cast to `any` | Fix the actual type |
| Property doesn't exist | Add `as any` | Check interface definition |
| Implicit any | Suppress warning | Add proper type annotation |

### Test Failures

| Situation | Wrong Approach | Right Approach |
|-----------|---------------|----------------|
| Assertion fails | Change expected value | Verify if code or test is wrong |
| Timeout | Increase timeout | Find what's hanging |
| Flaky test | Re-run until passes | Fix race condition |
| Tests pass alone, fail together | Add more isolation | Use `jest.resetAllMocks()` not `clearAllMocks()` |

**Important:** `jest.clearAllMocks()` only clears call history but keeps mock implementations. Use `jest.resetAllMocks()` in `beforeEach` to fully reset mock state including implementations, ensuring proper test isolation.

## Recovery Strategies

### Strategy 1: Read Error Carefully
```
Before retrying, ask:
- What exactly does the error say?
- What line number?
- What input caused it?
```

### Strategy 2: Check Recent Changes
```bash
git diff HEAD~3  # What changed recently?
git log --oneline -5  # When did it last work?
```

### Strategy 3: Isolate the Problem
```
- Comment out code to find which part fails
- Add console.log to trace execution
- Test with minimal reproduction
```

### Strategy 4: Search Codebase for Similar Patterns
```
How is this done elsewhere in the project?
Look for working examples to follow.
```

### Strategy 5: Escalate
```
If 3 different approaches fail:
1. Document what was tried
2. Ask the user for guidance
3. Don't keep trying blindly
```

## Anti-Patterns to Avoid

```typescript
// BAD: Retry loop without changes
while (error) {
  doSameThingAgain();  // Will fail forever
}

// BAD: Suppressing errors
try { riskyCode(); } catch { /* ignore */ }

// BAD: Random changes hoping something works
// "Maybe if I add await here..."
// "Let me try importing it differently..."

// GOOD: Systematic debugging
// 1. Understand the error
// 2. Form hypothesis
// 3. Test hypothesis
// 4. If wrong, try different hypothesis
```

## When to Stop and Ask

Stop attempting fixes and ask the user when:

1. **3+ different approaches failed** - You're missing context
2. **Error message is unclear** - Need more information
3. **Requires external action** - API keys, permissions, etc.
4. **Architectural decision needed** - Multiple valid solutions
5. **You're not sure why it worked** - Don't commit mystery fixes

## Checklist Before Retrying

- [ ] Did I read the full error message?
- [ ] Is this error different from before?
- [ ] Do I understand WHY the previous attempt failed?
- [ ] Am I trying something DIFFERENT this time?
- [ ] Have I checked if this works elsewhere in the codebase?
