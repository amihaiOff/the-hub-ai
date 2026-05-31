-- CreateTable
CREATE TABLE "moneytor_transactions" (
    "id" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_transactions_household_id_idx" ON "moneytor_transactions"("household_id");

-- CreateIndex
CREATE INDEX "moneytor_transactions_household_id_transaction_date_idx" ON "moneytor_transactions"("household_id", "transaction_date");

-- CreateIndex
CREATE INDEX "moneytor_transactions_category_idx" ON "moneytor_transactions"("category");

-- AddForeignKey
ALTER TABLE "moneytor_transactions" ADD CONSTRAINT "moneytor_transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
