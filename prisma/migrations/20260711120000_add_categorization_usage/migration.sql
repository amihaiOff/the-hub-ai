-- Add billable usage counters to AI categorization logs so the Labs → AI Spend
-- page can compute monthly cost and per-transaction averages.
ALTER TABLE "budget_categorization_logs"
  ADD COLUMN "input_tokens" INTEGER,
  ADD COLUMN "output_tokens" INTEGER,
  ADD COLUMN "cache_creation_tokens" INTEGER,
  ADD COLUMN "cache_read_tokens" INTEGER,
  ADD COLUMN "web_searches" INTEGER;
