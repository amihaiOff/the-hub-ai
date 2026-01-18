-- CreateTable
CREATE TABLE "net_worth_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "net_worth" DECIMAL(18,2) NOT NULL,
    "portfolio" DECIMAL(18,2) NOT NULL,
    "pension" DECIMAL(18,2) NOT NULL,
    "assets" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "net_worth_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "net_worth_snapshots_user_id_idx" ON "net_worth_snapshots"("user_id");

-- CreateIndex
CREATE INDEX "net_worth_snapshots_date_idx" ON "net_worth_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "net_worth_snapshots_user_id_date_key" ON "net_worth_snapshots"("user_id", "date");
