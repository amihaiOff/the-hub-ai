-- AlterTable
ALTER TABLE "shopping_cart_items" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "budget_transactions_household_id_is_deleted_transaction_dat_idx" ON "budget_transactions"("household_id", "is_deleted", "transaction_date");
