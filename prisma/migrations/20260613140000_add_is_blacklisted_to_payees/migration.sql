-- AlterTable
ALTER TABLE "budget_payees" ADD COLUMN "is_blacklisted" BOOLEAN NOT NULL DEFAULT false;

-- Index helps the `payee.isBlacklisted = false` filter that every transactions
-- query joins through.
CREATE INDEX "budget_payees_household_id_is_blacklisted_idx"
  ON "budget_payees"("household_id", "is_blacklisted");
