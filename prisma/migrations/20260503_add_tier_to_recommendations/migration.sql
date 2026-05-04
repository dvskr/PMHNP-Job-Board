-- Add `tier` to candidate_recommendations so the dashboard can render
-- Easy Apply / Direct Apply / Open badges per recommendation, and so the
-- /api/recommendations response is self-describing without a join back to
-- the Job row.
--
-- See lib/ai/job-classifier.ts for the resolution rules. Backfill existing
-- rows to 'external' (safe default — they'll re-classify on the next cron run).
--
-- Forward-only, additive.

ALTER TABLE "candidate_recommendations"
    ADD COLUMN IF NOT EXISTS "tier" TEXT NOT NULL DEFAULT 'external';

CREATE INDEX IF NOT EXISTS "candidate_recommendations_tier_idx"
    ON "candidate_recommendations" ("tier");
