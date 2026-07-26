-- Per-household snapshot day-of-month. Defaults to 26 so the monthly
-- net-worth reading gives figures time to settle (bank sync catches up,
-- pension deposits post). Capped at 28 in the app so every calendar
-- month has that day.
ALTER TABLE "households"
  ADD COLUMN "snapshot_day_of_month" INTEGER NOT NULL DEFAULT 26;
