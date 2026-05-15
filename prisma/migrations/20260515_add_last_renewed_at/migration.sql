-- Phase 3 #21 of UI refresh runbook (docs/runbooks/ui-refresh-2026-05.md).
-- Employer-controlled "refresh" timestamp used to gate digest eligibility.
-- A job older than 30d with no renew action is excluded from weekly digest
-- sends. This avoids landing stale postings in candidates' inboxes and gives
-- employers an explicit hook to keep their listings active.
--
-- Forward-only, additive, idempotent. New rows default null (the weekly
-- digest cron treats `lastRenewedAt IS NULL` as "use createdAt", so existing
-- jobs aren't all excluded on launch).

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "last_renewed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "jobs_last_renewed_at_idx" ON "jobs" ("last_renewed_at");
