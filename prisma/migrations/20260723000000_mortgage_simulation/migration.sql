-- Mortgage rate type enum for tracks whose rates evolve over time.
CREATE TYPE "MortgageRateType" AS ENUM ('FIXED', 'PRIME_LINKED', 'VARIABLE_24M');

-- Simulation inputs on each track. All nullable — legacy rows without these
-- values continue to render from their stored `amount` snapshot.
ALTER TABLE "mortgage_tracks"
  ADD COLUMN "origination_principal" DECIMAL(18, 2),
  ADD COLUMN "origination_date"      DATE,
  ADD COLUMN "payment_day"           INTEGER,
  ADD COLUMN "term_months"           INTEGER,
  ADD COLUMN "rate_type"             "MortgageRateType",
  ADD COLUMN "rate_spread"           DECIMAL(5, 4),
  ADD COLUMN "next_reset_date"       DATE;

-- Market rate history — one row per change of a named external rate (currently
-- just Bank of Israel Prime). A daily cron writes here only when the rate moves.
CREATE TABLE "market_rates" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "rate"           DECIMAL(6, 4) NOT NULL,
  "effective_from" DATE NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "market_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_rates_name_effective_from_key"
  ON "market_rates"("name", "effective_from");

CREATE INDEX "market_rates_name_effective_from_idx"
  ON "market_rates"("name", "effective_from");
