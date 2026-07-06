/**
 * One-shot backfill: populate `budget_transactions.notes` from the
 * matching `moneytor_transactions.extra_info` on rows where notes is
 * currently NULL. Two steps:
 *
 *   1. (optional, but recommended) Refresh `extra_info` on all
 *      moneytor_transactions by refetching every row from the Moneytor
 *      API. Historical rows never had `extra_info` stored, so without
 *      this step only rows re-fetched by the normal sync window have
 *      the field populated. Requires MONEYTOR_API_TOKEN.
 *   2. Copy `extra_info` → `notes` for every budget row where notes IS
 *      NULL and moneytor_id points to a moneytor_transaction with a
 *      non-null extra_info.
 *
 * Usage:
 *   DATABASE_URL="postgresql://amihaio@localhost:5432/hub_ai" \
 *     MONEYTOR_API_TOKEN="<jwt>" \
 *     npx tsx scripts/backfill-notes-from-extra-info.ts
 *
 * Safe: skips any budget row whose notes column is already set. Only
 * ever runs on localhost DBs (refuses non-local DATABASE_URL).
 */

import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}
if (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')) {
  console.error(
    'ERROR: refusing to run — DATABASE_URL is not localhost. This script only backfills local DBs.'
  );
  console.error('Host detected:', connectionString.match(/@([^/:]+)/)?.[1]);
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaPg } = require('@prisma/adapter-pg');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Pool } = require('pg');
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const MONEYTOR_BASE_URL = 'https://app.moneytor.co.il/api/v1';

interface MoneytorTxnFromApi {
  id: string;
  date: string;
  extra_info?: string | null;
}

async function refreshExtraInfoFromApi(
  token: string
): Promise<{ refreshed: number; scanned: number }> {
  // Grab everything back to 2020 — the API caps at limit=2000 per call
  // but our history is well under that. If a user has more, this loop
  // pages via the `to` cursor.
  const from = '2020-01-01';
  const url = new URL(`${MONEYTOR_BASE_URL}/transactions`);
  url.searchParams.set('from', from);
  url.searchParams.set('limit', '2000');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Moneytor API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { transactions?: MoneytorTxnFromApi[] };
  const rows = body.transactions ?? [];
  console.log(`Fetched ${rows.length} rows from Moneytor since ${from}`);

  // Only rows with a non-null extra_info are interesting — everything
  // else is a no-op update. Update in small batches.
  const withInfo = rows.filter((r) => r.extra_info != null && r.extra_info.length > 0);
  console.log(`  ${withInfo.length} of those have non-null extra_info`);

  let refreshed = 0;
  const BATCH = 25;
  for (let i = 0; i < withInfo.length; i += BATCH) {
    const batch = withInfo.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (r) => {
        try {
          const result = await prisma.moneytorTransaction.updateMany({
            where: { id: r.id },
            data: { extraInfo: r.extra_info ?? null },
          });
          refreshed += result.count;
        } catch (err) {
          console.warn(`  skip ${r.id}: ${(err as Error).message}`);
        }
      })
    );
  }
  return { refreshed, scanned: rows.length };
}

async function copyExtraInfoIntoNotes(): Promise<number> {
  // Find budget rows that:
  //   - have a Moneytor link (moneytorId IS NOT NULL)
  //   - have no user note yet (notes IS NULL)
  // and whose linked Moneytor row has an extraInfo value.
  const candidates = await prisma.budgetTransaction.findMany({
    where: {
      moneytorId: { not: null },
      notes: null,
    },
    select: { id: true, moneytorId: true, householdId: true },
  });
  console.log(`Budget rows with null notes + moneytor link: ${candidates.length}`);

  const moneytorIds = candidates.map((b) => b.moneytorId!).filter(Boolean);
  if (moneytorIds.length === 0) return 0;

  const mtxns = await prisma.moneytorTransaction.findMany({
    where: { id: { in: moneytorIds } },
    select: { id: true, extraInfo: true },
  });
  const extraByMoneytorId = new Map(mtxns.map((m) => [m.id, m.extraInfo] as const));

  const toUpdate = candidates.filter((b) => {
    const info = extraByMoneytorId.get(b.moneytorId!);
    return info != null && info.length > 0;
  });
  console.log(`  ${toUpdate.length} of those have a non-empty extraInfo to copy`);

  let updated = 0;
  const BATCH = 25;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (b) => {
        const info = extraByMoneytorId.get(b.moneytorId!);
        if (info == null) return;
        try {
          await prisma.budgetTransaction.update({
            where: { id: b.id },
            data: { notes: info },
          });
          updated++;
        } catch (err) {
          console.warn(`  skip ${b.id}: ${(err as Error).message}`);
        }
      })
    );
  }
  return updated;
}

async function main() {
  const token = process.env.MONEYTOR_API_TOKEN;
  if (token) {
    console.log('Step 1/2: refreshing extra_info from Moneytor API…');
    const { refreshed, scanned } = await refreshExtraInfoFromApi(token);
    console.log(`  refreshed ${refreshed} moneytor rows (out of ${scanned} scanned)`);
  } else {
    console.log('Step 1/2: skipped — MONEYTOR_API_TOKEN not set. Only rows already synced');
    console.log(
      '  since the extraInfo migration will have data. Set the token to backfill history.'
    );
  }

  console.log('\nStep 2/2: copying extra_info → notes on budget rows…');
  const updated = await copyExtraInfoIntoNotes();
  console.log(`  updated ${updated} budget rows`);
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
