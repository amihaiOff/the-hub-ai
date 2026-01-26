-- CreateTable
CREATE TABLE "stock_account_cash" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_account_cash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_account_cash_account_id_currency_key" ON "stock_account_cash"("account_id", "currency");

-- AddForeignKey
ALTER TABLE "stock_account_cash" ADD CONSTRAINT "stock_account_cash_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "stock_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
