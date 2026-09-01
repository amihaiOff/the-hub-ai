-- Pending→settled twin merge: record the soft-deleted twin's id on the
-- surviving row so the edit UI can surface the original date/moneytorId.

ALTER TABLE "budget_transactions"
  ADD COLUMN "merged_from_id" TEXT;

ALTER TABLE "budget_transactions"
  ADD CONSTRAINT "budget_transactions_merged_from_id_fkey"
  FOREIGN KEY ("merged_from_id") REFERENCES "budget_transactions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
