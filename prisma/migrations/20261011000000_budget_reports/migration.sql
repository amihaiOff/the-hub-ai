-- AlterTable
ALTER TABLE "households" ADD COLUMN     "report_prompt" TEXT;

-- AlterTable
ALTER TABLE "budget_categories" ADD COLUMN     "report_excluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "report_every_months" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "budget_reports" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "stats" JSONB NOT NULL,
    "report" JSONB,
    "report_error" TEXT,
    "model" TEXT,
    "usage" JSONB,
    "agent_state" JSONB,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "budget_reports_household_id_month_key" ON "budget_reports"("household_id", "month");

-- AddForeignKey
ALTER TABLE "budget_reports" ADD CONSTRAINT "budget_reports_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
