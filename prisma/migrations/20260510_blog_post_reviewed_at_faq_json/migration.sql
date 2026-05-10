-- Audit 14 HIGH + MEDIUM: BlogPosting freshness signals + FAQPage rich
-- result eligibility for the entire blog (not just 3 hardcoded slugs).
--
-- Two additive, nullable columns. Forward-only, idempotent — existing rows
-- are valid without backfill; the page render falls back to updatedAt and
-- the legacy hardcoded blogFaqData map respectively. The n8n content
-- pipeline populates new posts going forward; old posts get backfilled
-- editorially.

ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "faq_json"    JSONB;

-- Index for editorial-review dashboards that filter "posts not reviewed in
-- the last quarter." Cheap (partial index on a sparse column) and avoids a
-- table scan when the editorial cadence sweeps the catalog.
CREATE INDEX IF NOT EXISTS "blog_posts_reviewed_at_idx"
  ON "blog_posts" ("reviewed_at");
