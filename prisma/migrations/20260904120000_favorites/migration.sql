-- Favourites: per-user pinned destinations for the mobile favourites drawer.
--
-- Exactly one of `page_id` / `route` is set per row; that invariant is enforced
-- in the API (zod), not by a CHECK constraint — this schema has no CHECKs and
-- one code path writes these rows.
--
-- The two unique indexes stop the same destination being starred twice.
-- Postgres treats NULLs as distinct, so page rows (route NULL) never collide
-- with each other on the route index and vice versa; no partial index needed.
-- `household_id` is part of both because a route string carries no household
-- of its own.

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "page_id" TEXT,
    "route" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorites_household_id_owner_id_sort_order_idx" ON "favorites"("household_id", "owner_id", "sort_order");

-- CreateIndex
CREATE INDEX "favorites_page_id_idx" ON "favorites"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_owner_id_household_id_page_id_key" ON "favorites"("owner_id", "household_id", "page_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_owner_id_household_id_route_key" ON "favorites"("owner_id", "household_id", "route");

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
