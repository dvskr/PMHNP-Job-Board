-- Phase 0 Sprint 0.1 Ticket 0.1.4 — LLM Gateway cost tracking.
--
-- Every gateway call writes one row here. Powers the cost / latency / error
-- dashboards built in Sprint 0.4 plus the eval drift cron (Sprint 0.2).
-- Best-effort writes from lib/ai/cost-tracker.ts — caller never blocks on it.
--
-- Forward-only, additive. No data migration needed.

CREATE TABLE IF NOT EXISTS "ai_call_log" (
    "id"               TEXT          NOT NULL,
    "task"             TEXT          NOT NULL,                         -- e.g. 'candidate_scoring', 'resume_parsing', 'embedding'
    "provider"         TEXT          NOT NULL,                         -- 'openai' | 'anthropic'
    "model"            TEXT          NOT NULL,                         -- e.g. 'gpt-5-mini'
    "prompt_id"        TEXT,                                            -- prompt registry id (Sprint 0.2)
    "prompt_version"   TEXT,                                            -- prompt version (Sprint 0.2)
    "tenant_id"        TEXT          NOT NULL,                         -- employer_id, candidate user_id, or 'system'
    "tenant_type"      TEXT          NOT NULL,                         -- 'employer' | 'candidate' | 'admin' | 'system'
    "input_tokens"     INTEGER       NOT NULL DEFAULT 0,
    "cached_tokens"    INTEGER       NOT NULL DEFAULT 0,                -- subset of input_tokens that hit prompt cache
    "output_tokens"    INTEGER       NOT NULL DEFAULT 0,
    "cost_usd"         DECIMAL(12,6) NOT NULL DEFAULT 0,                -- dollars-and-microcents
    "latency_ms"       INTEGER       NOT NULL,
    "cache_hit"        BOOLEAN       NOT NULL DEFAULT false,            -- true when served from Redis cache
    "fallback_used"    BOOLEAN       NOT NULL DEFAULT false,            -- true when primary provider failed and a fallback served the call
    "error"            TEXT,                                            -- 'all_providers_failed' | 'invalid_output' | etc, null on success
    "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_log_pkey" PRIMARY KEY ("id")
);

-- Recency / dashboard scans.
CREATE INDEX IF NOT EXISTS "ai_call_log_created_at_idx"           ON "ai_call_log" ("created_at" DESC);
-- Per-task cost + drift queries.
CREATE INDEX IF NOT EXISTS "ai_call_log_task_created_at_idx"      ON "ai_call_log" ("task", "created_at" DESC);
-- Per-tenant cost attribution + abuse investigation.
CREATE INDEX IF NOT EXISTS "ai_call_log_tenant_created_at_idx"    ON "ai_call_log" ("tenant_id", "created_at" DESC);
-- Filter for the failure dashboard.
CREATE INDEX IF NOT EXISTS "ai_call_log_error_created_at_idx"     ON "ai_call_log" ("error", "created_at" DESC) WHERE "error" IS NOT NULL;
