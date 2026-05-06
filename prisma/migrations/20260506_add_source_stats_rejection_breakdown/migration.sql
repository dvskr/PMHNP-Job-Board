-- Step-8 visibility fix: surface the rejection funnel in source_stats so
-- trend queries can answer "is greenhouse's relevance-rejection rate
-- climbing?" without scanning rejected_jobs.
--
-- Forward-only, additive — both columns are nullable / default-zero so
-- existing rows are valid without backfill.

ALTER TABLE "source_stats"
    ADD COLUMN IF NOT EXISTS "jobs_rejected"      INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "rejected_by_reason" JSONB;
