-- AddForeignKey
ALTER TABLE "riseup_categories" ADD CONSTRAINT "riseup_categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
