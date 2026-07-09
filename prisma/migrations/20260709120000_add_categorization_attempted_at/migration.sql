-- Track whether the AI has already been asked about a transaction, so the
-- automatic ingestion pass attempts each one exactly once (no re-querying the
-- model on every cron drain).

ALTER TABLE "budget_transactions"
  ADD COLUMN "categorization_attempted_at" TIMESTAMP(3);

CREATE INDEX "budget_transactions_household_id_categorization_attempted_at_idx"
  ON "budget_transactions"("household_id", "categorization_attempted_at");
