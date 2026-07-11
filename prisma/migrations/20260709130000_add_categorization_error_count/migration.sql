-- Count of failed AI categorization attempts per transaction. Transient
-- failures are retried on later drains; once the count hits the app-level cap
-- the row is marked attempted so a persistent failure (e.g. a bad API key)
-- cannot re-bill the same transaction on every cron run.

ALTER TABLE "budget_transactions"
  ADD COLUMN "categorization_error_count" INTEGER NOT NULL DEFAULT 0;
