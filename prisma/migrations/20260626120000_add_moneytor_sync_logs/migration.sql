-- CreateTable
CREATE TABLE "moneytor_sync_logs" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "results" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moneytor_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moneytor_sync_logs_household_id_started_at_idx" ON "moneytor_sync_logs"("household_id", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "moneytor_sync_logs" ADD CONSTRAINT "moneytor_sync_logs_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
