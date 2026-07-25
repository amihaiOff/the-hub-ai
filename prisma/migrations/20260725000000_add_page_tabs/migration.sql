-- Page tabs: each Areas page can hold multiple tabs, each with its own Tiptap
-- JSON content. A page always has at least one tab.
CREATE TABLE "page_tabs" (
  "id" TEXT NOT NULL,
  "page_id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "content" JSONB,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "page_tabs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_tabs_page_id_sort_order_idx" ON "page_tabs"("page_id", "sort_order");

ALTER TABLE "page_tabs"
  ADD CONSTRAINT "page_tabs_page_id_fkey"
  FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing page becomes a single tab holding its current content
-- so nothing is lost and existing pages keep rendering.
INSERT INTO "page_tabs" ("id", "page_id", "title", "content", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, "id", '', "content", 0, "created_at", "updated_at"
FROM "pages";
