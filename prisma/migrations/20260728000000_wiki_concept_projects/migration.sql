-- CreateTable
CREATE TABLE "wiki_concept_projects" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wiki_concept_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wiki_concept_projects_source_id_project_id_key" ON "wiki_concept_projects"("source_id", "project_id");

-- CreateIndex
CREATE INDEX "wiki_concept_projects_project_id_idx" ON "wiki_concept_projects"("project_id");

-- AddForeignKey
ALTER TABLE "wiki_concept_projects" ADD CONSTRAINT "wiki_concept_projects_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "wiki_concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_concept_projects" ADD CONSTRAINT "wiki_concept_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "wiki_concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill memberships from the legacy single-project link so existing
-- source→project assignments carry over into the many-to-many table.
INSERT INTO "wiki_concept_projects" ("id", "source_id", "project_id", "created_at")
SELECT gen_random_uuid()::text, "id", "project_id", "created_at"
FROM "wiki_concepts"
WHERE "project_id" IS NOT NULL;
