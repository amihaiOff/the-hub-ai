-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CALLS', 'DEEP_WORK', 'OUT_AND_ABOUT', 'BLOCKED', 'DECIDE', 'QUICK');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "type" "TaskType";
