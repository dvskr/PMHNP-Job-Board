-- Phase 0 Sprint 0.4 — AI feature flags + per-tenant overrides.
--
-- Two layers stack to decide if an AI feature is enabled:
--   1. Static default in lib/ai/feature-flags.ts (compiled-in default).
--   2. Global env override (KILL_AI_<FLAG>=1 disables instantly).
--   3. Per-tenant DB row in `ai_feature_flag_override` (admin-managed via
--      Sprint 0.4.4 kill-switch UI).
--
-- The decision order is: env kill > DB override > compiled default. The
-- env layer is the emergency stop — anyone with prod env access can disable
-- a feature in <1 minute without a deploy (per non-negotiable #1).
--
-- Forward-only, additive.

CREATE TABLE IF NOT EXISTS "ai_feature_flag_override" (
    "id"          TEXT          NOT NULL,
    "flag"        TEXT          NOT NULL,                                  -- e.g. 'ai.candidate.cover_letter'
    "tenant_type" TEXT          NOT NULL,                                  -- 'employer' | 'candidate' | 'admin' | 'global'
    "tenant_id"   TEXT,                                                     -- null when tenant_type='global'
    "enabled"     BOOLEAN       NOT NULL,
    "reason"      TEXT,                                                     -- free-form note for the audit trail
    "set_by"      TEXT,                                                     -- admin user id; null for system
    "expires_at"  TIMESTAMP(3),                                             -- nullable; ephemeral overrides clean themselves up
    "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feature_flag_override_pkey" PRIMARY KEY ("id")
);

-- Lookup pattern: WHERE flag=X AND ((tenant_type=Y AND tenant_id=Z) OR tenant_type='global').
CREATE INDEX IF NOT EXISTS "ai_feature_flag_override_flag_idx"            ON "ai_feature_flag_override" ("flag");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_feature_flag_override_unique_target_idx"
    ON "ai_feature_flag_override" ("flag", "tenant_type", COALESCE("tenant_id", '__GLOBAL__'));
CREATE INDEX IF NOT EXISTS "ai_feature_flag_override_expires_at_idx"      ON "ai_feature_flag_override" ("expires_at") WHERE "expires_at" IS NOT NULL;
