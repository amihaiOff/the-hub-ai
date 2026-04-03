/*
  Warnings:

  - Added the required column `updated_at` to the `shopping_cart_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add updated_at with default for existing rows
ALTER TABLE "shopping_cart_items" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "shopping_items" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_purchased_at" TIMESTAMP(3),
ADD COLUMN     "name_he" TEXT,
ADD COLUMN     "warning_days" INTEGER;

-- CreateTable
CREATE TABLE "shopping_deliveries" (
    "id" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_count" INTEGER NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_deliveries_household_id_idx" ON "shopping_deliveries"("household_id");

-- AddForeignKey
ALTER TABLE "shopping_deliveries" ADD CONSTRAINT "shopping_deliveries_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
