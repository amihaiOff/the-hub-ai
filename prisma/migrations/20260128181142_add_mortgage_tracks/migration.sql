-- CreateTable
CREATE TABLE "mortgage_tracks" (
    "id" TEXT NOT NULL,
    "mortgage_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "interest_rate" DECIMAL(5,4) NOT NULL,
    "monthly_payment" DECIMAL(18,2),
    "maturity_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mortgage_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mortgage_tracks_mortgage_id_idx" ON "mortgage_tracks"("mortgage_id");

-- AddForeignKey
ALTER TABLE "mortgage_tracks" ADD CONSTRAINT "mortgage_tracks_mortgage_id_fkey" FOREIGN KEY ("mortgage_id") REFERENCES "misc_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
