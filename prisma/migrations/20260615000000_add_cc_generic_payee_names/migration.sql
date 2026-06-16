-- CreateTable
CREATE TABLE "cc_generic_payee_names" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cc_generic_payee_names_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cc_generic_payee_names_household_id_idx" ON "cc_generic_payee_names"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "cc_generic_payee_names_household_id_name_key" ON "cc_generic_payee_names"("household_id", "name");

-- AddForeignKey
ALTER TABLE "cc_generic_payee_names" ADD CONSTRAINT "cc_generic_payee_names_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
