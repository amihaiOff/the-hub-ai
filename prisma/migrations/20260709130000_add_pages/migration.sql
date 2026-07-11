-- Pages: Notion-like household documents (rich content stored as Tiptap JSON),
-- listed under "Areas" in the sidebar.
CREATE TABLE "pages" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "emoji" TEXT,
  "content" JSONB,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "owner_id" TEXT NOT NULL,
  "household_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pages_household_id_idx" ON "pages"("household_id");
CREATE INDEX "pages_household_id_sort_order_idx" ON "pages"("household_id", "sort_order");

ALTER TABLE "pages"
  ADD CONSTRAINT "pages_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pages"
  ADD CONSTRAINT "pages_household_id_fkey"
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
