-- CreateEnum
CREATE TYPE "PensionAccountType" AS ENUM ('pension', 'hishtalmut');

-- CreateTable
CREATE TABLE "pension_accounts" (
    "id" TEXT NOT NULL,
    "type" "PensionAccountType" NOT NULL,
    "provider_name" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "current_value" DECIMAL(18,2) NOT NULL,
    "fee_from_deposit" DECIMAL(5,4) NOT NULL,
    "fee_from_total" DECIMAL(5,4) NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pension_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_deposits" (
    "id" TEXT NOT NULL,
    "deposit_date" DATE NOT NULL,
    "salary_month" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "employer" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pension_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pension_deposits_account_id_idx" ON "pension_deposits"("account_id");

-- CreateIndex
CREATE INDEX "pension_deposits_salary_month_idx" ON "pension_deposits"("salary_month");

-- AddForeignKey
ALTER TABLE "pension_accounts" ADD CONSTRAINT "pension_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_deposits" ADD CONSTRAINT "pension_deposits_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "pension_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
