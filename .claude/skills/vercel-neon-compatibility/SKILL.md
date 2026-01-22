# Vercel + Neon Serverless Compatibility

This skill documents patterns and anti-patterns for code that must work on both local development and Vercel production with Neon PostgreSQL.

## Production Stack

- **Runtime:** Vercel Serverless Functions (Node.js)
- **Database:** Neon PostgreSQL (serverless, HTTP-based)
- **Bundler:** Turbopack
- **Limits:** 10s default timeout (60s max), 50MB function size, 1024MB memory

## Critical Anti-Patterns

### 1. Prisma `createMany` with Neon

**DON'T:**

```typescript
await prisma.user.createMany({ data: users });
```

**DO:**

```typescript
for (const user of users) {
  await prisma.user.create({ data: user });
}
// Or use Promise.all for parallel creation (be mindful of connection limits)
await Promise.all(users.map((user) => prisma.user.create({ data: user })));
```

**Why:** Neon's HTTP fetch mode (`poolQueryViaFetch: true`) has known issues with `createMany`. Always use individual `create` calls.

### 2. Interactive Transactions

**DON'T:**

```typescript
await prisma.$transaction(async (tx) => {
  const a = await tx.model1.create({...});
  await tx.model2.create({ model1Id: a.id });
});
```

**DO:**

```typescript
// Use array syntax (sequential, no nested queries)
await prisma.$transaction([
  prisma.model1.create({...}),
  prisma.model2.create({...}),
]);

// Or handle without transactions if possible
const a = await prisma.model1.create({...});
const b = await prisma.model2.create({ model1Id: a.id });
```

**Why:** Interactive transactions with callbacks can be unstable with Neon's HTTP mode and may timeout on serverless.

### 3. Dynamic Requires in Libraries

**DON'T:** Use libraries with dynamic require patterns like:

```javascript
require(`./module/${variable}/file.js`);
```

**DO:**

- Add problematic libraries to `serverExternalPackages` in `next.config.ts`
- Or replace with serverless-compatible alternatives

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'other-problematic-lib'],
};
```

**Why:** Turbopack can't trace dynamic requires, causing missing files in production bundles.

### 4. Long-Running Operations

**DON'T:**

```typescript
for (const item of items) {
  await processItem(item);
  await sleep(200); // Rate limiting
}
```

**DO:**

```typescript
// Add maxDuration export
export const maxDuration = 60; // seconds

// Process in parallel batches
const BATCH_SIZE = 5;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(processItem));
  await sleep(200); // Rate limit between batches, not items
}
```

**Why:** Vercel functions timeout at 10s by default. Sequential processing with delays easily exceeds this.

### 5. Large In-Memory Operations

**DON'T:**

```typescript
const allData = await prisma.table.findMany(); // Could be huge
const zip = createZipInMemory(allData);
return new Response(zip);
```

**DO:**

```typescript
// Paginate and stream
const BATCH_SIZE = 100;
let cursor = undefined;
while (true) {
  const batch = await prisma.table.findMany({
    take: BATCH_SIZE,
    cursor: cursor ? { id: cursor } : undefined,
  });
  if (batch.length === 0) break;
  // Process batch
  cursor = batch[batch.length - 1].id;
}
```

**Why:** Serverless has memory limits (1024MB). Large datasets can cause OOM.

## Required Route Exports

For routes that may take longer than 10 seconds:

```typescript
// Cron jobs, backup/restore, PDF parsing
export const maxDuration = 60;

// Explicit runtime (optional but recommended)
export const runtime = 'nodejs'; // or 'edge' for simple routes
```

## Database Configuration

The project uses this Neon configuration in `lib/db/index.ts`:

```typescript
import { neonConfig } from '@neondatabase/serverless';

// Required for Vercel serverless
neonConfig.poolQueryViaFetch = true;
```

**Known limitations with this config:**

- `createMany` doesn't work reliably
- Interactive transactions may fail
- Connection pooling behaves differently

## File Operations

**DON'T:** Use file system operations

```typescript
import fs from 'fs';
fs.writeFileSync('/tmp/file.txt', data); // /tmp exists but is ephemeral
```

**DO:** Use in-memory Buffers or external storage (S3, etc.)

```typescript
const buffer = Buffer.from(data);
// Process buffer directly or upload to S3
```

**Why:** Serverless has no persistent filesystem. `/tmp` is available but ephemeral and limited (512MB on Vercel).

## Dependency Considerations

1. **Check bundle size:** Large deps (>10MB) impact cold start
2. **Avoid native modules:** May not work in serverless
3. **Use dynamic imports:** For heavy optional dependencies
4. **Audit regularly:** `npx depcheck` to find unused deps

## Testing Production Compatibility

Before deploying new features:

1. Run `npm run build` - catches bundling issues
2. Test with `npm run start` - closer to production than dev
3. Check Vercel deployment logs for warnings
4. Monitor function execution time in Vercel dashboard

## Common Error Patterns

| Error                           | Cause                        | Fix                           |
| ------------------------------- | ---------------------------- | ----------------------------- |
| "Module not found" in prod only | Dynamic require              | Add to serverExternalPackages |
| Transaction timeout             | Long interactive transaction | Use array syntax or remove    |
| createMany fails silently       | Neon HTTP mode               | Use individual creates        |
| Function timeout                | >10s execution               | Add maxDuration, optimize     |
| Memory exceeded                 | Large in-memory data         | Paginate/stream               |
