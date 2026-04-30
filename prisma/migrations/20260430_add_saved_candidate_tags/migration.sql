-- Add the `tags` column to saved_candidates.
--
-- Background: prisma/schema.prisma has had `tags String[] @default([])` on
-- the SavedCandidate model since the model was introduced, but no
-- migration was ever generated. The original schema was bootstrapped via
-- `prisma db push` to a dev DB, and the prod baseline (0_init) didn't
-- include it. As a result, /api/employer/saved-candidates errors with
-- Prisma P2022 ("column (not available) does not exist") for every
-- employer hitting their saved-candidates list.
--
-- Forward-only. Default `'{}'::text[]` matches the schema default so
-- existing rows pick up an empty array transparently.

ALTER TABLE "saved_candidates"
ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}';
