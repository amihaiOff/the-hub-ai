-- AlterTable
ALTER TABLE "budget_transactions" ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "budget_transactions_household_id_is_deleted_idx" ON "budget_transactions"("household_id", "is_deleted");
