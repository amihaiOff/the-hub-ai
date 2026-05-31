-- CreateTable
CREATE TABLE "cron_run_logs" (
    "id" TEXT NOT NULL,
    "cron_path" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "results" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cron_run_logs_cron_path_started_at_idx" ON "cron_run_logs"("cron_path", "started_at" DESC);

-- CreateIndex
CREATE INDEX "cron_run_logs_started_at_idx" ON "cron_run_logs"("started_at" DESC);
