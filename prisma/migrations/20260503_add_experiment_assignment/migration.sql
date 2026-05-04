-- Phase 1 Sprint 1.1.6 — A/B experiment assignment + per-arm event log.
--
-- Two tables:
--
-- 1. `experiment_assignment` — sticky per-tenant arm picks. Once a (tenant,
--    experiment) pair has a row, that arm wins for the lifetime of the
--    experiment. The helper in lib/ai/experiments.ts inserts on first
--    request and reads on every subsequent one.
--
-- 2. `experiment_event` — append-only per-event log. Used to compute
--    arm-level CTR, apply-rate, and any other downstream metric we care
--    about. The helper writes one row per surface impression / click;
--    the analytics view aggregates across them.
--
-- Forward-only, additive. Safe to deploy ahead of code.

CREATE TABLE IF NOT EXISTS "experiment_assignment" (
    "id"             TEXT         NOT NULL,
    "experiment"     TEXT         NOT NULL,                                  -- e.g. 'semantic_search.v1'
    "tenant_type"    TEXT         NOT NULL,                                  -- 'employer' | 'candidate' | 'admin' | 'system'
    "tenant_id"      TEXT         NOT NULL,                                  -- stable id; 'system:<hash>' for anonymous (cookie-derived)
    "arm"            TEXT         NOT NULL,                                  -- e.g. 'control' | 'treatment'
    "assigned_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_assignment_pkey" PRIMARY KEY ("id")
);

-- One arm per (experiment, tenant). Reads use the same triple — must hit a
-- unique index so the helper can use upsert-on-conflict semantics later.
CREATE UNIQUE INDEX IF NOT EXISTS "experiment_assignment_unique_target_idx"
    ON "experiment_assignment" ("experiment", "tenant_type", "tenant_id");

-- Per-experiment recency scan for cleanup / analytics joins.
CREATE INDEX IF NOT EXISTS "experiment_assignment_experiment_assigned_at_idx"
    ON "experiment_assignment" ("experiment", "assigned_at" DESC);

-- ── Per-event log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "experiment_event" (
    "id"             TEXT         NOT NULL,
    "experiment"     TEXT         NOT NULL,
    "arm"            TEXT         NOT NULL,
    "tenant_type"    TEXT         NOT NULL,
    "tenant_id"      TEXT         NOT NULL,
    "event_type"     TEXT         NOT NULL,                                  -- e.g. 'impression' | 'click' | 'apply'
    "subject_id"     TEXT,                                                    -- e.g. job id for an apply event
    "metadata"       JSONB,                                                   -- free-form per-event payload
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_event_pkey" PRIMARY KEY ("id")
);

-- Aggregation pattern: GROUP BY experiment, arm, event_type WHERE created_at > now() - interval 'X days'.
CREATE INDEX IF NOT EXISTS "experiment_event_experiment_arm_type_created_at_idx"
    ON "experiment_event" ("experiment", "arm", "event_type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "experiment_event_tenant_created_at_idx"
    ON "experiment_event" ("tenant_type", "tenant_id", "created_at" DESC);
