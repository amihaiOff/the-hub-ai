-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "main_branch" TEXT NOT NULL,
    "sub_branch" TEXT,
    "product_type" TEXT,
    "company" TEXT,
    "insurance_period" TEXT,
    "additional_details" TEXT,
    "premium_ils" DECIMAL(12,2),
    "premium_type" TEXT,
    "policy_number" TEXT,
    "plan_classification" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insurance_policies_household_id_idx" ON "insurance_policies"("household_id");

-- CreateIndex
CREATE INDEX "insurance_policies_profile_id_idx" ON "insurance_policies"("profile_id");

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
