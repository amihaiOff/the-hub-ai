-- CreateEnum
CREATE TYPE "MiscAssetType" AS ENUM ('bank_deposit', 'loan', 'mortgage', 'child_savings');

-- CreateTable
CREATE TABLE "misc_assets" (
    "id" TEXT NOT NULL,
    "type" "MiscAssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "current_value" DECIMAL(18,2) NOT NULL,
    "interest_rate" DECIMAL(5,4) NOT NULL,
    "monthly_payment" DECIMAL(18,2),
    "monthly_deposit" DECIMAL(18,2),
    "maturity_date" DATE,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "misc_assets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "misc_assets" ADD CONSTRAINT "misc_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
