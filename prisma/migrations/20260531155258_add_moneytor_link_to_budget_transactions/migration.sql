-- AlterEnum
ALTER TYPE "TransactionSource" ADD VALUE 'moneytor_sync';

-- AlterTable
ALTER TABLE "budget_transactions" ADD COLUMN "moneytor_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "budget_transactions_moneytor_id_key" ON "budget_transactions"("moneytor_id");
