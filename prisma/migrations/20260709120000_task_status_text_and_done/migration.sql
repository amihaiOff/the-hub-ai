-- Tasks: `status` becomes a free-text label, and a new `done` boolean drives
-- completion (the card checkmark / Archive) instead of the old DONE status.

-- 1. Add the completion flag.
ALTER TABLE "tasks" ADD COLUMN "done" BOOLEAN NOT NULL DEFAULT false;

-- 2. Convert `status` from the TaskStatus enum to free text. The default must
-- be dropped before the type change, then re-set to an empty label.
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE TEXT USING ("status"::text);
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT '';

-- 3. Backfill: previously-DONE tasks become done, and the old enum values are
-- rewritten as readable free-text labels (DONE/TODO collapse to no label since
-- completion is now captured by `done`).
UPDATE "tasks" SET "done" = true WHERE "status" = 'DONE';
UPDATE "tasks" SET "status" = CASE "status"
  WHEN 'TODO' THEN ''
  WHEN 'DONE' THEN ''
  WHEN 'IN_PROGRESS' THEN 'In progress'
  WHEN 'BLOCKED' THEN 'Blocked'
  WHEN 'CANCELLED' THEN 'Cancelled'
  ELSE "status"
END;

-- 4. Drop the now-unused enum type.
DROP TYPE "TaskStatus";
