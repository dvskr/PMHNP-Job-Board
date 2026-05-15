-- 2026-05-14 — JobDraft migration from email-token anchor to auth-anchor.
--
-- Adds a nullable `user_id` column with a unique index so each
-- authenticated employer has at most one in-progress draft (the
-- auto-save target). Existing email-anchored rows keep working
-- because user_id stays NULL on them — and NULL values don't collide
-- under the unique constraint in Postgres.
--
-- Also relaxes `email` and `resume_token` to nullable so new auth-
-- anchored rows don't have to populate them. Existing rows are not
-- affected.
--
-- Forward-only, additive, idempotent.

ALTER TABLE "job_drafts"
  ADD COLUMN IF NOT EXISTS "user_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "job_drafts_user_id_key"
  ON "job_drafts" ("user_id");

-- Relax nullability. SET NOT NULL would fail anyway since we have no
-- back-fill, so we just drop the constraint where it exists.
ALTER TABLE "job_drafts" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "job_drafts" ALTER COLUMN "resume_token" DROP NOT NULL;
