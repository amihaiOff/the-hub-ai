-- Observability for the monthly BoI Prime fetch. One row per fetch attempt,
-- regardless of whether the rate changed or the fetch succeeded — every
-- lookup lands here with the source URL the LLM cited so debugging a bad
-- reading is a single SELECT away.
CREATE TABLE "market_rate_fetch_logs" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "source_url"    TEXT,
  "rate"          DECIMAL(6, 4),
  "previous_rate" DECIMAL(6, 4),
  "inserted"      BOOLEAN NOT NULL DEFAULT false,
  "error"         TEXT,
  "notes"         TEXT,
  "fetched_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_rate_fetch_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "market_rate_fetch_logs_name_fetched_at_idx"
  ON "market_rate_fetch_logs"("name", "fetched_at" DESC);
