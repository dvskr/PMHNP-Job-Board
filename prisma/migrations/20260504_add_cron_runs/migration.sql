-- P4.3: per-cron run log so we can detect silent failures + missed schedules.
-- Crons opt in via lib/cron/track.ts.
--
-- Forward-only, additive.

CREATE TABLE IF NOT EXISTS "cron_runs" (
    "id"          TEXT PRIMARY KEY,
    "name"        TEXT NOT NULL,
    "started_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "success"     BOOLEAN NOT NULL DEFAULT FALSE,
    "duration_ms" INTEGER,
    "error"       TEXT,
    "metrics"     JSONB
);

CREATE INDEX IF NOT EXISTS "cron_runs_name_started_at_idx"
    ON "cron_runs" ("name", "started_at" DESC);
