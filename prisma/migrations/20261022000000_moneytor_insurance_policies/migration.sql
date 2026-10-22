-- CreateTable
CREATE TABLE "moneytor_insurance_policies" (
    "id" TEXT NOT NULL,
    "policy_key" TEXT NOT NULL,
    "policy_number" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "company_short" TEXT,
    "category_key" TEXT,
    "category_label_heb" TEXT,
    "category_label_eng" TEXT,
    "status" TEXT,
    "monthly_premium" DECIMAL(18,2) NOT NULL,
    "annual_premium" DECIMAL(18,2) NOT NULL,
    "renewal_period" TEXT,
    "person_id" TEXT,
    "insured_name" TEXT,
    "coverages" JSONB NOT NULL DEFAULT '[]',
    "raw_data" JSONB,
    "household_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moneytor_insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_insurance_policies_household_id_idx" ON "moneytor_insurance_policies"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "moneytor_insurance_policies_household_id_policy_key_key" ON "moneytor_insurance_policies"("household_id", "policy_key");

-- AddForeignKey
ALTER TABLE "moneytor_insurance_policies" ADD CONSTRAINT "moneytor_insurance_policies_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

