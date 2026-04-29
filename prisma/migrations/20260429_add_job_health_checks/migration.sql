-- Append-only audit log for job-health decisions.
--
-- Every row in this table is the evidence behind one decision (HTTP probe,
-- Greenhouse-API probe, or source-presence sweep). Sprint 3 starts writing
-- here from the existing decision points; later sprints (multi-signal
-- voting, anomaly detection, support-ticket archaeology) read from it.
--
-- Retention: rows are NEVER deleted by application code. Sprint 5 will add
-- a partitioned monthly vacuum job. Until then expect ~100k rows/week.

-- CreateTable
CREATE TABLE "job_health_checks" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "alive" BOOLEAN NOT NULL,
    "http_status" INTEGER,
    "redirect_hops" INTEGER,
    "final_url" TEXT,
    "api_url" TEXT,
    "soft_pattern_id" TEXT,
    "soft_match_text" TEXT,
    "error_kind" TEXT,
    "error_message" TEXT,
    "elapsed_ms" INTEGER,
    "presence_source" TEXT,
    "presence_fetched" INTEGER,
    "presence_historical_avg" DOUBLE PRECISION,
    "presence_seen_again" INTEGER,
    "presence_missing" INTEGER,
    "presence_skipped_reason" TEXT,
    "checker_version" TEXT NOT NULL,

    CONSTRAINT "job_health_checks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "job_health_checks"
    ADD CONSTRAINT "job_health_checks_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (job timeline lookups)
CREATE INDEX "job_health_checks_job_id_checked_at_idx"
    ON "job_health_checks"("job_id", "checked_at" DESC);

-- CreateIndex (anomaly + reporting scans by outcome)
CREATE INDEX "job_health_checks_outcome_checked_at_idx"
    ON "job_health_checks"("outcome", "checked_at" DESC);

-- CreateIndex (time-window scans)
CREATE INDEX "job_health_checks_checked_at_idx"
    ON "job_health_checks"("checked_at" DESC);
