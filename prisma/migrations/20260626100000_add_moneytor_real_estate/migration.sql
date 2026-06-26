-- CreateTable
CREATE TABLE "moneytor_real_estate" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "current_value" DECIMAL(18,2) NOT NULL,
    "balance_in_base" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "ownership" DECIMAL(5,2),
    "purchase_price" DECIMAL(18,2),
    "purchase_date" DATE,
    "purchase_expenses" DECIMAL(18,2),
    "country" TEXT,
    "city" TEXT,
    "street" TEXT,
    "house_number" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "property_type" TEXT,
    "property_condition" TEXT,
    "measurement_unit" TEXT,
    "built_area" DECIMAL(10,2),
    "garden_balcony_size" DECIMAL(10,2),
    "bedrooms" INTEGER,
    "floor" INTEGER,
    "apartment_floors" TEXT,
    "rent" DECIMAL(18,2),
    "rent_suggestion" DECIMAL(18,2),
    "rent_type" TEXT,
    "income_frequency" TEXT,
    "sale_commission" DECIMAL(8,4),
    "profit_tax" DECIMAL(18,2),
    "general_selling_expenses" DECIMAL(18,2),
    "legal_expenses" DECIMAL(18,2),
    "linked_mortgage_ref" TEXT,
    "custom_subtitle" TEXT,
    "raw_data" JSONB,
    "household_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_real_estate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_real_estate_household_id_product_id_key" ON "moneytor_real_estate"("household_id", "product_id");
CREATE INDEX "moneytor_real_estate_household_id_idx" ON "moneytor_real_estate"("household_id");

-- AddForeignKey
ALTER TABLE "moneytor_real_estate" ADD CONSTRAINT "moneytor_real_estate_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "moneytor_real_estate_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_month" DATE NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "current_value" DECIMAL(18,2) NOT NULL,
    "balance_in_base" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moneytor_real_estate_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_real_estate_snapshots_household_id_snapshot_month_product_id_key" ON "moneytor_real_estate_snapshots"("household_id", "snapshot_month", "product_id");
CREATE INDEX "moneytor_real_estate_snapshots_household_id_snapshot_month_idx" ON "moneytor_real_estate_snapshots"("household_id", "snapshot_month");

-- AddForeignKey
ALTER TABLE "moneytor_real_estate_snapshots" ADD CONSTRAINT "moneytor_real_estate_snapshots_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
