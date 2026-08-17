-- CreateTable
CREATE TABLE "page_sections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_sections_household_id_sort_order_idx" ON "page_sections"("household_id", "sort_order");

-- AddForeignKey
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN "section_id" TEXT;

-- CreateIndex
CREATE INDEX "pages_household_id_section_id_idx" ON "pages"("household_id", "section_id");

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "page_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
