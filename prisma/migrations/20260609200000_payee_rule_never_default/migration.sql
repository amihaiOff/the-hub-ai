-- DropForeignKey (cascade FK is recreated below with nullable column)
ALTER TABLE "payee_category_rules" DROP CONSTRAINT IF EXISTS "payee_category_rules_category_id_fkey";

-- AlterTable: make category_id nullable, add mark_never_default
ALTER TABLE "payee_category_rules" ALTER COLUMN "category_id" DROP NOT NULL;
ALTER TABLE "payee_category_rules" ADD COLUMN "mark_never_default" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "payee_category_rules"
  ADD CONSTRAINT "payee_category_rules_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "budget_categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
