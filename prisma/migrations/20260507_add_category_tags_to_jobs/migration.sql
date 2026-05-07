-- pSEO P9: pre-computed canonical category slugs per job.
--
-- The column was added to schema.prisma but the corresponding migration
-- was never committed (added via `prisma db push` in dev). Production
-- has been running without it, which surfaces as:
--
--   PrismaClientKnownRequestError P2022:
--     "The column `(not available)` does not exist in the current database."
--
-- whenever a query selects all Job columns (e.g. /jobs/state/[state]).
--
-- Forward-only, additive, idempotent — safe to deploy multiple times.
-- Default `'{}'` means existing rows are valid without backfill; the
-- ingest layer (lib/pseo/category-tagger.ts) and the
-- scripts/backfill-category-tags.ts script populate values over time.

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "category_tags" TEXT[] NOT NULL DEFAULT '{}';

-- GIN index for `categoryTags has 'X'` queries that drive every
-- taxonomy×city and taxonomy×state pSEO page after the P9 swap.
CREATE INDEX IF NOT EXISTS "jobs_category_tags_idx"
  ON "jobs" USING GIN ("category_tags");
