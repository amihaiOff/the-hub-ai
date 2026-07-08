-- Store an optional icon name (a lucide-react icon key) per task category so
-- users can pick an icon for each category in the task category manager.
ALTER TABLE "task_categories" ADD COLUMN "icon" TEXT;
