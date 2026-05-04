-- Phase 0 Sprint 0.2 ticket 0.2.7 — daily eval snapshots for drift detection.
--
-- One row per (task, day). The drift cron compares the latest snapshot's
-- mean_score to the 7-day moving average and alerts on >10% drops.
-- Append-only — never delete rows; the moving-average math depends on history.
--
-- Forward-only, additive.

CREATE TABLE IF NOT EXISTS "ai_eval_snapshot" (
    "id"              TEXT          NOT NULL,
    "task"            TEXT          NOT NULL,
    "prompt_version"  TEXT          NOT NULL,
    "mean_score"      DOUBLE PRECISION NOT NULL,
    "passed"          INTEGER       NOT NULL,
    "total_cases"     INTEGER       NOT NULL,
    "cost_usd"        DECIMAL(12,6) NOT NULL DEFAULT 0,
    "p95_latency_ms"  INTEGER       NOT NULL DEFAULT 0,
    "holds_baseline"  BOOLEAN       NOT NULL DEFAULT false,
    "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_eval_snapshot_pkey" PRIMARY KEY ("id")
);

-- Trend queries always slice by (task, recency).
CREATE INDEX IF NOT EXISTS "ai_eval_snapshot_task_created_at_idx" ON "ai_eval_snapshot" ("task", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_eval_snapshot_created_at_idx"     ON "ai_eval_snapshot" ("created_at" DESC);
