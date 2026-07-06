-- Stable-key columns on synced Moneytor entities. Populated by the sync
-- reconciler; nullable so backfill can compute values from rawData in a
-- follow-up pass without blocking the migration.

-- moneytor_accounts
ALTER TABLE "moneytor_accounts" ADD COLUMN "stable_key" TEXT;
ALTER TABLE "moneytor_accounts" ADD COLUMN "user_canonical_id" TEXT;
ALTER TABLE "moneytor_accounts" ADD COLUMN "missing_since" TIMESTAMP(3);
CREATE INDEX "moneytor_accounts_household_id_stable_key_idx"
  ON "moneytor_accounts"("household_id", "stable_key");

-- Backfill stable_key from openfinanceAssetId when present in raw_data.
-- Banks + CC debts always have it; mortgage / share fall through to NULL
-- and the reconciler uses productId as the fallback.
UPDATE "moneytor_accounts"
SET "stable_key" = raw_data->>'openfinanceAssetId'
WHERE raw_data ? 'openfinanceAssetId'
  AND raw_data->>'openfinanceAssetId' IS NOT NULL
  AND raw_data->>'openfinanceAssetId' <> '';

-- moneytor_pension_funds
ALTER TABLE "moneytor_pension_funds" ADD COLUMN "stable_key" TEXT;
ALTER TABLE "moneytor_pension_funds" ADD COLUMN "user_canonical_id" TEXT;
ALTER TABLE "moneytor_pension_funds" ADD COLUMN "missing_since" TIMESTAMP(3);
CREATE INDEX "moneytor_pension_funds_household_id_stable_key_idx"
  ON "moneytor_pension_funds"("household_id", "stable_key");

-- Backfill: institution|accountNumber|routeName lowercased. NULLs when any
-- component is missing.
UPDATE "moneytor_pension_funds"
SET "stable_key" =
  LOWER(TRIM(institution)) || '|' ||
  LOWER(TRIM(COALESCE(account_number, ''))) || '|' ||
  LOWER(TRIM(route_name))
WHERE institution IS NOT NULL
  AND account_number IS NOT NULL
  AND route_name IS NOT NULL;

-- moneytor_real_estate
ALTER TABLE "moneytor_real_estate" ADD COLUMN "stable_key" TEXT;
ALTER TABLE "moneytor_real_estate" ADD COLUMN "user_canonical_id" TEXT;
ALTER TABLE "moneytor_real_estate" ADD COLUMN "missing_since" TIMESTAMP(3);
CREATE INDEX "moneytor_real_estate_household_id_stable_key_idx"
  ON "moneytor_real_estate"("household_id", "stable_key");

UPDATE "moneytor_real_estate"
SET "stable_key" = LOWER(TRIM(address))
WHERE address IS NOT NULL AND address <> '';

-- general_logs
CREATE TABLE "general_logs" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "description" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "general_logs_household_id_created_at_idx"
  ON "general_logs"("household_id", "created_at" DESC);
CREATE INDEX "general_logs_household_id_read_at_idx"
  ON "general_logs"("household_id", "read_at");

ALTER TABLE "general_logs" ADD CONSTRAINT "general_logs_household_id_fkey"
  FOREIGN KEY ("household_id") REFERENCES "households"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
