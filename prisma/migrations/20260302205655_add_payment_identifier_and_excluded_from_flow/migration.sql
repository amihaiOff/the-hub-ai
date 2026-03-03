-- AlterTable
ALTER TABLE "budget_transactions" ADD COLUMN     "excluded_from_flow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payment_identifier" TEXT;
