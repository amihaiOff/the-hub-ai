-- CreateTable
CREATE TABLE "moneytor_accounts" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "subtype" TEXT,
    "account_number" TEXT,
    "currency" TEXT NOT NULL,
    "balance_in_base" DECIMAL(18,2) NOT NULL,
    "interest_rate" DECIMAL(8,4),
    "maturity_date" DATE,
    "monthly_payment" DECIMAL(18,2),
    "raw_data" JSONB,
    "household_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moneytor_account_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balance_in_base" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_account_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_accounts_household_id_idx" ON "moneytor_accounts"("household_id");

-- CreateIndex
CREATE INDEX "moneytor_accounts_household_id_form_idx" ON "moneytor_accounts"("household_id", "form");

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_accounts_household_id_product_id_key" ON "moneytor_accounts"("household_id", "product_id");

-- CreateIndex
CREATE INDEX "moneytor_account_snapshots_household_id_snapshot_date_idx" ON "moneytor_account_snapshots"("household_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_account_snapshots_household_id_snapshot_date_produ_key" ON "moneytor_account_snapshots"("household_id", "snapshot_date", "product_id");

-- AddForeignKey
ALTER TABLE "moneytor_accounts" ADD CONSTRAINT "moneytor_accounts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moneytor_account_snapshots" ADD CONSTRAINT "moneytor_account_snapshots_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
