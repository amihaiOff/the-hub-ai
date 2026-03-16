-- CreateTable
CREATE TABLE "payee_category_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payee_category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payee_category_rules_household_id_idx" ON "payee_category_rules"("household_id");

-- CreateIndex
CREATE INDEX "payee_category_rules_category_id_idx" ON "payee_category_rules"("category_id");

-- AddForeignKey
ALTER TABLE "payee_category_rules" ADD CONSTRAINT "payee_category_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_category_rules" ADD CONSTRAINT "payee_category_rules_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
