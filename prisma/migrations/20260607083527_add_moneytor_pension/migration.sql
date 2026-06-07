-- CreateTable
CREATE TABLE "moneytor_pension_funds" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "route_name" TEXT NOT NULL,
    "route_code" TEXT,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "product_type" TEXT NOT NULL,
    "sug_kupa" INTEGER,
    "sug_keren_pensia" TEXT,
    "account_number" TEXT,
    "account_owner" TEXT,
    "fund_id" TEXT,
    "fund_opening_date" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "balance_in_base" DECIMAL(18,2) NOT NULL,
    "profits_from_last_year" DECIMAL(8,4),
    "monthly_deposit_employee" DECIMAL(18,2),
    "monthly_deposit_employer" DECIMAL(18,2),
    "monthly_deposit_sum" DECIMAL(18,2),
    "deposit_frequency" TEXT,
    "employer_provision_pct" DECIMAL(8,4),
    "compensation_provision_pct" DECIMAL(8,4),
    "mgmt_fee_from_savings" DECIMAL(8,4),
    "mgmt_fee_from_deposit" DECIMAL(8,4),
    "projected_monthly_pension" DECIMAL(18,2),
    "projected_savings_with_premiums" DECIMAL(18,2),
    "projected_savings_without_premiums" DECIMAL(18,2),
    "years_to_retirement" INTEGER,
    "gil_prisha" INTEGER,
    "sum_hafkadot_pitsuyim" DECIMAL(18,2),
    "sum_hafkadot_lo_pitsuyim" DECIMAL(18,2),
    "pitzuim_maasik_nochechi" DECIMAL(18,2),
    "pitzuim_markiv_lemas" DECIMAL(18,2),
    "gender" TEXT,
    "taarich_leyda" DATE,
    "matsav_mishpachti" TEXT,
    "raw_data" JSONB,
    "household_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_pension_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moneytor_pension_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_month" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "route_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "product_type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_in_base" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "monthly_deposit_sum" DECIMAL(18,2),
    "profits_from_last_year" DECIMAL(8,4),
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_pension_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_pension_funds_household_id_idx" ON "moneytor_pension_funds"("household_id");

-- CreateIndex
CREATE INDEX "moneytor_pension_funds_household_id_product_type_idx" ON "moneytor_pension_funds"("household_id", "product_type");

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_pension_funds_household_id_product_id_route_name_key" ON "moneytor_pension_funds"("household_id", "product_id", "route_name");

-- CreateIndex
CREATE INDEX "moneytor_pension_snapshots_household_id_snapshot_month_idx" ON "moneytor_pension_snapshots"("household_id", "snapshot_month");

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_pension_snapshots_household_id_snapshot_month_prod_key" ON "moneytor_pension_snapshots"("household_id", "snapshot_month", "product_id", "route_name");

-- AddForeignKey
ALTER TABLE "moneytor_pension_funds" ADD CONSTRAINT "moneytor_pension_funds_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moneytor_pension_snapshots" ADD CONSTRAINT "moneytor_pension_snapshots_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
