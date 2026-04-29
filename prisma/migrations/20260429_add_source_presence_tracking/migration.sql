-- Source-presence tracking columns for the jobs health system.
--
-- After each successful ingest run, we compare the set of external_ids
-- returned by the source against the set of currently-published jobs from
-- that source. Jobs whose external_id was NOT returned increment
-- health_consecutive_missing; jobs that were returned reset it to 0 and
-- bump health_last_seen_at.
--
-- Sprint 2: shadow-mode only — these columns are written but not used to
-- flip is_published. Sprint 3 enables auto-unpublish at >= 3 consecutive
-- misses, gated by a "full fetch" threshold so source outages don't trip it.

-- AlterTable
ALTER TABLE "jobs"
  ADD COLUMN "health_consecutive_missing" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "health_last_seen_at" TIMESTAMP(3);

-- CreateIndex
-- Supports the orphan-detection query that scans jobs missing for N runs.
CREATE INDEX "jobs_source_provider_health_consecutive_missing_idx"
  ON "jobs"("source_provider", "health_consecutive_missing");
