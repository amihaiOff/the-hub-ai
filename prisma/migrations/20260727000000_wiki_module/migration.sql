-- Wiki module. OKF-inspired knowledge bundle with LLM-generated summaries
-- and comprehension quizzes. See docs and lib/ai/wiki-summarize.ts.

ALTER TABLE "households" ADD COLUMN "wiki_prompt" TEXT;

CREATE TABLE "wiki_concepts" (
  "id"            TEXT NOT NULL,
  "household_id"  TEXT NOT NULL,
  "path"          TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "frontmatter"   JSONB NOT NULL DEFAULT '{}',
  "body"          TEXT NOT NULL,
  "project_id"    TEXT,
  "source_url"    TEXT,
  "source_raw"    TEXT,
  "generated_by"  TEXT,
  "generated_at"  TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wiki_concepts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wiki_concepts_household_id_path_key"
  ON "wiki_concepts"("household_id", "path");
CREATE INDEX "wiki_concepts_household_id_type_idx"
  ON "wiki_concepts"("household_id", "type");
CREATE INDEX "wiki_concepts_household_id_project_id_idx"
  ON "wiki_concepts"("household_id", "project_id");

ALTER TABLE "wiki_concepts"
  ADD CONSTRAINT "wiki_concepts_household_id_fkey"
  FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE;
ALTER TABLE "wiki_concepts"
  ADD CONSTRAINT "wiki_concepts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "wiki_concepts"("id") ON DELETE SET NULL;

CREATE TABLE "wiki_questions" (
  "id"           TEXT NOT NULL,
  "concept_id"   TEXT NOT NULL,
  "order_index"  INTEGER NOT NULL,
  "question"     TEXT NOT NULL,
  "options"      JSONB NOT NULL,
  "correct_idx"  INTEGER NOT NULL,
  "explanation"  TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wiki_questions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wiki_questions_concept_id_order_index_idx"
  ON "wiki_questions"("concept_id", "order_index");
ALTER TABLE "wiki_questions"
  ADD CONSTRAINT "wiki_questions_concept_id_fkey"
  FOREIGN KEY ("concept_id") REFERENCES "wiki_concepts"("id") ON DELETE CASCADE;

CREATE TABLE "wiki_question_attempts" (
  "id"            TEXT NOT NULL,
  "question_id"   TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "selected_idx"  INTEGER NOT NULL,
  "correct"       BOOLEAN NOT NULL,
  "attempted_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wiki_question_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "wiki_question_attempts_user_id_question_id_idx"
  ON "wiki_question_attempts"("user_id", "question_id");
ALTER TABLE "wiki_question_attempts"
  ADD CONSTRAINT "wiki_question_attempts_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "wiki_questions"("id") ON DELETE CASCADE;
ALTER TABLE "wiki_question_attempts"
  ADD CONSTRAINT "wiki_question_attempts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
