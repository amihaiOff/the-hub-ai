-- CreateTable
CREATE TABLE "budget_account_names" (
    "id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_account_names_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_account_names_household_id_idx" ON "budget_account_names"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_account_names_household_id_account_number_key" ON "budget_account_names"("household_id", "account_number");

-- AddForeignKey
ALTER TABLE "budget_account_names" ADD CONSTRAINT "budget_account_names_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
