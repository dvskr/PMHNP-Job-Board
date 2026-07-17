-- GSC Fix (2026-07 audit): honest per-URL lastmod for the city sitemaps.
-- updatedAt is bumped by every aggregate-pseo run (4x/day) regardless of
-- change, so it tracks aggregator liveness, not content change. This column
-- is set only when totalJobs/rawAvgSalary/colAdjustedSalary actually differ.
-- Additive + nullable: safe to apply with traffic live.
ALTER TABLE "PseoStats" ADD COLUMN IF NOT EXISTS "contentChangedAt" TIMESTAMP(3);
