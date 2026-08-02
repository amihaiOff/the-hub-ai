/**
 * Hard guarantee that every Prisma model is either backed up by
 * `/api/backup` or explicitly listed in the intentional-exclusion
 * allowlist below. Fails CI if someone adds a new model to
 * `schema.prisma` without also wiring it into backup + restore (or
 * consciously excluding it).
 *
 * Sister test in `restore.test.ts` asserts symmetry on the restore
 * side — every user-data table backed up here is also read + written
 * by the restore route.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '../../../..');
const SCHEMA_PATH = join(REPO_ROOT, 'prisma/schema.prisma');
const BACKUP_PATH = join(REPO_ROOT, 'app/api/backup/route.ts');
const RESTORE_PATH = join(REPO_ROOT, 'app/api/restore/route.ts');

/**
 * Models the backup route intentionally skips. Everything here is
 * either regenerable (caches, logs), reproducible from external
 * sources (Prime rate fetch log), or auth ephemera. If you add a
 * model that legitimately doesn't need backup, add it here with a
 * one-liner explaining why.
 */
const INTENTIONALLY_EXCLUDED = new Set<string>([
  'VerificationToken', // auth ephemera, short-lived tokens
  'StockPriceHistory', // cached prices, refetched by cron
  'MarketRateFetchLog', // BoI Prime lookup telemetry (the rates themselves ARE backed up)
  'BudgetCategorizationLog', // AI categorization telemetry (token usage + audit)
  'CronRunLog', // cron runtime telemetry
]);

function parsePrismaModels(schemaText: string): string[] {
  const matches = schemaText.matchAll(/^model\s+(\w+)\s*\{/gm);
  return Array.from(matches, (m) => m[1]).sort();
}

/** camelCase for the Prisma client accessor. */
function toPrismaAccessor(model: string): string {
  return model[0].toLowerCase() + model.slice(1);
}

function findBackedUpModels(routeText: string, models: string[]): Set<string> {
  const backed = new Set<string>();
  for (const model of models) {
    const needle = `prisma.${toPrismaAccessor(model)}.findMany`;
    if (routeText.includes(needle)) backed.add(model);
  }
  return backed;
}

function findRestoredModels(routeText: string, models: string[]): Set<string> {
  const restored = new Set<string>();
  for (const model of models) {
    const accessor = toPrismaAccessor(model);
    // Restore must both delete the model and create rows for it.
    if (
      routeText.includes(`prisma.${accessor}.deleteMany`) &&
      routeText.includes(`prisma.${accessor}.create`)
    ) {
      restored.add(model);
    }
  }
  return restored;
}

describe('backup + restore coverage', () => {
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  const backup = readFileSync(BACKUP_PATH, 'utf-8');
  const restore = readFileSync(RESTORE_PATH, 'utf-8');
  const models = parsePrismaModels(schema);

  it('every Prisma model is either backed up or explicitly excluded', () => {
    const backedUp = findBackedUpModels(backup, models);
    const missing = models.filter((m) => !backedUp.has(m) && !INTENTIONALLY_EXCLUDED.has(m));
    if (missing.length > 0) {
      throw new Error(
        `New Prisma model(s) are not covered by backup:\n  ${missing.join('\n  ')}\n\n` +
          `Fix: add the model to app/api/backup/route.ts (findMany + zip.file),\n` +
          `add the parse/delete/create loop to app/api/restore/route.ts, and bump\n` +
          `schemaVersion. If the model is genuinely regenerable (cache/log/ephemeral),\n` +
          `add it to INTENTIONALLY_EXCLUDED in this test with a reason.`
      );
    }
  });

  it('every backed-up user-data model has matching restore code', () => {
    const backedUp = findBackedUpModels(backup, models);
    const restored = findRestoredModels(restore, models);
    const asymmetric = [...backedUp].filter((m) => !restored.has(m));
    if (asymmetric.length > 0) {
      throw new Error(
        `Model(s) backed up but not restored (silent data loss on restore):\n  ${asymmetric.join('\n  ')}\n\n` +
          `Fix: add deleteMany + create loop for each in app/api/restore/route.ts.`
      );
    }
  });

  it('the exclusion allowlist references only real models', () => {
    const orphan = [...INTENTIONALLY_EXCLUDED].filter((m) => !models.includes(m));
    if (orphan.length > 0) {
      throw new Error(
        `INTENTIONALLY_EXCLUDED references model(s) that no longer exist in schema.prisma:\n  ${orphan.join('\n  ')}\n\n` +
          `Fix: remove them from the allowlist.`
      );
    }
  });
});
