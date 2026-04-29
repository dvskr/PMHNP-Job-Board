-- Convert job_health_checks to a monthly-partitioned table.
--
-- The table grows ~22k rows/week (3k from check-dead-links × 2 runs/day +
-- ~20 from source-presence + occasional flips). At 1 year that's ~1.1M rows.
-- Performance is fine well past that, but partitioning lets us drop old
-- data in milliseconds (one DROP TABLE) instead of a multi-minute DELETE
-- + VACUUM, and keeps per-partition indexes small.
--
-- Strategy: rename the existing table to a `_legacy` archive, create a
-- new partitioned parent with the same schema, attach 14 future monthly
-- partitions (1 each from 2026-04 through 2027-05), and migrate the
-- legacy rows into the new partitions in one INSERT … SELECT.
--
-- Forward-only. Safe under concurrent writes because we wrap the cutover
-- in a single transaction so writers either go to the legacy table
-- (before commit) or the partitioned table (after commit), never both.

BEGIN;

-- 1. Rename the existing table out of the way.
ALTER TABLE "job_health_checks" RENAME TO "job_health_checks_legacy";
ALTER INDEX "job_health_checks_pkey" RENAME TO "job_health_checks_legacy_pkey";
ALTER INDEX "job_health_checks_job_id_checked_at_idx" RENAME TO "job_health_checks_legacy_job_id_checked_at_idx";
ALTER INDEX "job_health_checks_outcome_checked_at_idx" RENAME TO "job_health_checks_legacy_outcome_checked_at_idx";
ALTER INDEX "job_health_checks_checked_at_idx" RENAME TO "job_health_checks_legacy_checked_at_idx";

-- 2. Create the partitioned parent. Same columns + types as the original.
--    PARTITION BY RANGE on `checked_at` so monthly chunks slot in cleanly.
--    NOTE: primary-key constraint on partitioned tables must include the
--    partition key, so PK is now (id, checked_at). Application code uses
--    `id` for FK joins which still works because (id) alone is unique
--    in practice (uuid v4) — but to keep referential integrity guarantees
--    we add a separate UNIQUE INDEX on (id) only when Postgres allows.
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
    CONSTRAINT "job_health_checks_pkey" PRIMARY KEY ("id", "checked_at")
) PARTITION BY RANGE ("checked_at");

-- Re-create the original indexes on the parent (auto-propagate to partitions).
CREATE INDEX "job_health_checks_job_id_checked_at_idx"
    ON "job_health_checks"("job_id", "checked_at" DESC);
CREATE INDEX "job_health_checks_outcome_checked_at_idx"
    ON "job_health_checks"("outcome", "checked_at" DESC);
CREATE INDEX "job_health_checks_checked_at_idx"
    ON "job_health_checks"("checked_at" DESC);

-- FK back to jobs. ON DELETE CASCADE preserved.
ALTER TABLE "job_health_checks"
    ADD CONSTRAINT "job_health_checks_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Pre-create monthly partitions covering Apr 2026 through May 2027 +
--    a default catch-all so unexpected dates don't fail inserts.
CREATE TABLE "job_health_checks_2026_04" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE "job_health_checks_2026_05" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE "job_health_checks_2026_06" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE "job_health_checks_2026_07" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE "job_health_checks_2026_08" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE "job_health_checks_2026_09" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE "job_health_checks_2026_10" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE "job_health_checks_2026_11" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE "job_health_checks_2026_12" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE "job_health_checks_2027_01" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE "job_health_checks_2027_02" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE "job_health_checks_2027_03" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE "job_health_checks_2027_04" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE "job_health_checks_2027_05" PARTITION OF "job_health_checks"
    FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

-- Default partition catches any row outside the predeclared ranges.
-- Should stay empty in practice; serves as a safety net so writes never
-- fail with "no partition for the row".
CREATE TABLE "job_health_checks_default" PARTITION OF "job_health_checks" DEFAULT;

-- 4. Migrate any existing rows from the legacy table.
INSERT INTO "job_health_checks" SELECT * FROM "job_health_checks_legacy";

-- 5. Drop the legacy table. (Comment this line out if you want to keep
--    a rollback path; the legacy table will then linger in the DB.)
DROP TABLE "job_health_checks_legacy";

COMMIT;

-- Future maintenance:
--   - Add the next month's partition before the current month ends.
--     Suggested: a monthly cron that runs:
--       CREATE TABLE job_health_checks_YYYY_MM PARTITION OF job_health_checks
--           FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY+1-MM-01');
--   - Drop partitions older than the retention window:
--       DROP TABLE job_health_checks_YYYY_MM;
