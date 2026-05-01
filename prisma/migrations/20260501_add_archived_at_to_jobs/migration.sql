-- Add `archived_at` to jobs so employers can hide finished postings from
-- their dashboard (and from public listings) without losing the historical
-- record. Archive is distinct from pause (isManuallyUnpublished) — paused
-- jobs are temporarily off but can be republished and still consume the
-- same expiresAt window; archived jobs are explicitly "done".
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- Public list/search pages filter `WHERE archived_at IS NULL` so this index
-- keeps that fast even when archived rows accumulate.
CREATE INDEX IF NOT EXISTS "jobs_archived_at_idx" ON "jobs" ("archived_at");
