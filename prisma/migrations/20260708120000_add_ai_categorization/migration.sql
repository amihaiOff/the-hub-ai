-- AI transaction auto-categorization: per-transaction suggestion fields, a
-- household-scoped Anthropic API key, and a query log.

-- Suggestion fields on budget_transactions (transaction stays uncategorized
-- until the user approves; these only mark the AI's guess).
ALTER TABLE "budget_transactions"
  ADD COLUMN "suggested_category_id" TEXT,
  ADD COLUMN "suggestion_confidence" DOUBLE PRECISION,
  ADD COLUMN "suggested_at" TIMESTAMP(3);

CREATE INDEX "budget_transactions_suggested_category_id_idx" ON "budget_transactions"("suggested_category_id");

ALTER TABLE "budget_transactions"
  ADD CONSTRAINT "budget_transactions_suggested_category_id_fkey"
  FOREIGN KEY ("suggested_category_id") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Anthropic API key for AI categorization (per household).
ALTER TABLE "households" ADD COLUMN "anthropic_api_key" TEXT;

-- Query log.
CREATE TABLE "budget_categorization_logs" (
  "id" TEXT NOT NULL,
  "household_id" TEXT NOT NULL,
  "transaction_id" TEXT,
  "transaction_name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "result_category_id" TEXT,
  "result_category_name" TEXT,
  "confidence" DOUBLE PRECISION,
  "reasoning" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_categorization_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "budget_categorization_logs_household_id_created_at_idx" ON "budget_categorization_logs"("household_id", "created_at");

ALTER TABLE "budget_categorization_logs"
  ADD CONSTRAINT "budget_categorization_logs_household_id_fkey"
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
