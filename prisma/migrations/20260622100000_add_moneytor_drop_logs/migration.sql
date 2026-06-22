-- CreateTable
CREATE TABLE "moneytor_drop_logs" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "original_moneytor_id" TEXT,
    "budget_transaction_id" TEXT,
    "transaction_date" DATE NOT NULL,
    "amount_ils" DECIMAL(18,2) NOT NULL,
    "payee_name" TEXT,
    "description" TEXT,
    "reason" TEXT NOT NULL,
    "dropped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moneytor_drop_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_drop_logs_household_id_dropped_at_idx" ON "moneytor_drop_logs"("household_id", "dropped_at");

-- AddForeignKey
ALTER TABLE "moneytor_drop_logs" ADD CONSTRAINT "moneytor_drop_logs_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
