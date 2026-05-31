-- CreateTable
CREATE TABLE "moneytor_stock_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "stock_name" TEXT NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "stock_price" DECIMAL(20,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "total_worth_in_base" DECIMAL(18,2) NOT NULL,
    "account_cash" DECIMAL(18,2),
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_stock_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_stock_snapshots_household_id_snapshot_date_idx" ON "moneytor_stock_snapshots"("household_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_stock_snapshots_household_id_snapshot_date_product_key" ON "moneytor_stock_snapshots"("household_id", "snapshot_date", "product_id", "stock_name");

-- AddForeignKey
ALTER TABLE "moneytor_stock_snapshots" ADD CONSTRAINT "moneytor_stock_snapshots_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
