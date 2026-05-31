-- CreateTable
CREATE TABLE "moneytor_stock_holdings" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "broker" TEXT,
    "stock_name" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "purchase_price" DECIMAL(20,4),
    "purchase_date" DATE,
    "stock_price" DECIMAL(20,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "total_worth_in_base" DECIMAL(18,2) NOT NULL,
    "account_cash" DECIMAL(18,2),
    "household_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_stock_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_stock_holdings_household_id_idx" ON "moneytor_stock_holdings"("household_id");

-- CreateIndex
CREATE INDEX "moneytor_stock_holdings_household_id_product_id_idx" ON "moneytor_stock_holdings"("household_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_stock_holdings_household_id_product_id_stock_name_key" ON "moneytor_stock_holdings"("household_id", "product_id", "stock_name");

-- AddForeignKey
ALTER TABLE "moneytor_stock_holdings" ADD CONSTRAINT "moneytor_stock_holdings_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
