-- CreateTable
CREATE TABLE "riseup_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "budget_category_id" TEXT,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riseup_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "riseup_categories_household_id_idx" ON "riseup_categories"("household_id");

-- CreateIndex
CREATE INDEX "riseup_categories_budget_category_id_idx" ON "riseup_categories"("budget_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "riseup_categories_household_id_name_key" ON "riseup_categories"("household_id", "name");

-- AddForeignKey
ALTER TABLE "riseup_categories" ADD CONSTRAINT "riseup_categories_budget_category_id_fkey" FOREIGN KEY ("budget_category_id") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
