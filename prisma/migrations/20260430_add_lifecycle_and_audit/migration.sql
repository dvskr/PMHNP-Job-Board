-- Sprint 3: account lifecycle (soft-delete + inactive purge) + audit log.
--
-- Adds 4 nullable columns to user_profiles to support:
--   * GDPR storage limitation — inactive-user purge cron uses last_seen_at
--   * GDPR Art. 17 + dispute window — soft-delete with 30-day grace via
--     deleted_at + purge_at
--   * One-time warning email gate via purge_warning_email_sent_at
--
-- Creates audit_logs as the SOC2 audit trail and GDPR Art. 30 record-of-
-- processing source. Append-only by convention — only INSERTs ever.
--
-- Forward-only, additive. No data migration needed.

-- ── user_profiles lifecycle columns ───────────────────────────────────
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "last_seen_at"                  TIMESTAMP(3);
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "deleted_at"                    TIMESTAMP(3);
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "purge_at"                      TIMESTAMP(3);
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "purge_warning_email_sent_at"   TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "user_profiles_deleted_at_idx"   ON "user_profiles" ("deleted_at");
CREATE INDEX IF NOT EXISTS "user_profiles_purge_at_idx"     ON "user_profiles" ("purge_at");
CREATE INDEX IF NOT EXISTS "user_profiles_last_seen_at_idx" ON "user_profiles" ("last_seen_at");

-- ── audit_logs table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"           TEXT         NOT NULL,
    "action"       TEXT         NOT NULL,
    "actor_type"   TEXT         NOT NULL,
    "actor_id"     TEXT,
    "target_type"  TEXT,
    "target_id"    TEXT,
    "ip"           TEXT,
    "user_agent"   TEXT,
    "metadata"     JSONB,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_action_idx"                   ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_actor_id_idx"                 ON "audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_target_type_target_id_idx"    ON "audit_logs" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx"               ON "audit_logs" ("created_at" DESC);
