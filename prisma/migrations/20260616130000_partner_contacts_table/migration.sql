-- Pivot the single households.partner_phone column into a partner_contacts
-- table so a household can have multiple "ask on WhatsApp" recipients with
-- names (e.g. "Wife", "Mom").

-- CreateTable
CREATE TABLE "partner_contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_contacts_household_id_phone_key" ON "partner_contacts"("household_id", "phone");
CREATE INDEX "partner_contacts_household_id_idx" ON "partner_contacts"("household_id");

-- AddForeignKey
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: copy any value that was already stored in households.partner_phone
-- into a "Partner" row on the new table, then drop the old column.
INSERT INTO "partner_contacts" ("id", "name", "phone", "household_id", "created_at", "updated_at")
SELECT
  CONCAT('pc_', SUBSTR(MD5(RANDOM()::text || h.id), 1, 22)),
  'Partner',
  h."partner_phone",
  h.id,
  NOW(),
  NOW()
FROM "households" h
WHERE h."partner_phone" IS NOT NULL AND h."partner_phone" <> '';

-- AlterTable - drop the old single-value column
ALTER TABLE "households" DROP COLUMN "partner_phone";
