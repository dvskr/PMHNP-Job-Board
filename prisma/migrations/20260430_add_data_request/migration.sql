-- Add the `data_requests` table for DSAR (Data Subject Access Request) intake.
--
-- Background: GDPR Art. 15-22 and CCPA/CPRA each give individuals the right
-- to access, delete, correct, port, object to, or restrict the processing of
-- their personal data. The privacy policy promises a 30-day SLA (45 days
-- under CCPA). This table is the source of truth for tracking those
-- requests so we can prove the SLA was met during a regulator audit.
--
-- Populated by:
--   POST /api/data-request   — public, rate-limited (3/hr/IP)
--
-- `due_by` is computed at insert time from the requester's jurisdiction
-- (CCPA = 45d, everything else = 30d) so a daily admin task can sort by it
-- and escalate anything overdue.
--
-- Forward-only, additive. No data migration needed.

CREATE TABLE IF NOT EXISTS "data_requests" (
    "id"                TEXT         NOT NULL,
    "email"             TEXT         NOT NULL,
    "full_name"         TEXT,
    "type"              TEXT         NOT NULL,
    "description"       TEXT,
    "jurisdiction"      TEXT,
    "status"            TEXT         NOT NULL DEFAULT 'received',
    "identity_verified" BOOLEAN      NOT NULL DEFAULT false,
    "resolution_note"   TEXT,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at"   TIMESTAMP(3),
    "completed_at"      TIMESTAMP(3),
    "due_by"            TIMESTAMP(3) NOT NULL,
    "requester_ip"      TEXT,
    "user_agent"        TEXT,

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "data_requests_email_idx"      ON "data_requests" ("email");
CREATE INDEX IF NOT EXISTS "data_requests_status_idx"     ON "data_requests" ("status");
CREATE INDEX IF NOT EXISTS "data_requests_due_by_idx"     ON "data_requests" ("due_by" ASC);
CREATE INDEX IF NOT EXISTS "data_requests_created_at_idx" ON "data_requests" ("created_at" DESC);
