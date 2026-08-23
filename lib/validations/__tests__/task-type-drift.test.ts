/**
 * Drift guard for the task `type` enum. `TASK_TYPES` in lib/validations/tasks.ts
 * is the value the API validates against and the UI renders columns/pickers
 * from, while Postgres enforces the Prisma `TaskType` enum. If the two ever
 * disagree, requests pass zod and then blow up at the database — so this test
 * pins them together (and to the migration that created the DB enum).
 *
 * Same approach as app/api/backup/__tests__/coverage.test.ts: parse
 * schema.prisma as text rather than importing the generated client.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TASK_TYPES } from '../tasks';

const REPO_ROOT = join(__dirname, '../../..');
const SCHEMA_PATH = join(REPO_ROOT, 'prisma/schema.prisma');
const MIGRATIONS_DIR = join(REPO_ROOT, 'prisma/migrations');

function prismaEnumValues(name: string): string[] {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const block = new RegExp(`^enum\\s+${name}\\s*\\{([^}]*)\\}`, 'm').exec(schema);
  if (!block) throw new Error(`enum ${name} not found in schema.prisma`);
  return block[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0);
}

/** Values from the `CREATE TYPE "TaskType" AS ENUM (...)` migration. */
function migrationEnumValues(): string[] {
  for (const dir of readdirSync(MIGRATIONS_DIR)) {
    const path = join(MIGRATIONS_DIR, dir, 'migration.sql');
    let sql: string;
    try {
      sql = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const match = /CREATE TYPE "TaskType" AS ENUM \(([^)]*)\)/.exec(sql);
    if (match) {
      return match[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
    }
  }
  throw new Error('No migration creates the TaskType enum');
}

describe('TaskType enum parity', () => {
  it('matches the Prisma TaskType enum exactly, in the same order', () => {
    // Order matters: the kanban columns and every picker render in TASK_TYPES
    // order, and the schema is the human-facing reference for that order.
    expect([...TASK_TYPES]).toEqual(prismaEnumValues('TaskType'));
  });

  it('matches the enum created by the migration', () => {
    expect([...TASK_TYPES].sort()).toEqual(migrationEnumValues().sort());
  });

  it('is declared nullable on the Task model', () => {
    const schema = readFileSync(SCHEMA_PATH, 'utf8');
    const model = /^model\s+Task\s*\{([\s\S]*?)^\}/m.exec(schema);
    expect(model).not.toBeNull();
    // `type TaskType?` — the optional marker is what lets the UI clear it.
    expect(model![1]).toMatch(/^\s*type\s+TaskType\?\s*$/m);
  });
});
