-- Job alert double opt-in (CASL / GDPR best practice).
--
-- New columns on job_alerts:
--   * confirmed_at        — null until the user clicks the confirmation
--                           link emailed at signup. The send-alerts cron
--                           only fires when this is set.
--   * confirmation_token  — single-use cuid included in the confirmation
--                           email. Cleared on confirm so the link can't
--                           be replayed.
--
-- Existing rows are grandfathered: their confirmed_at is set to
-- created_at so we don't break alerts that were already firing under
-- the old single opt-in flow.
--
-- The default value for is_active is also flipped from TRUE to FALSE so
-- newly inserted rows wait for confirmation. Schema change only —
-- existing rows keep whatever value they had.

ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3);
ALTER TABLE "job_alerts" ADD COLUMN IF NOT EXISTS "confirmation_token" TEXT;

-- Backfill: existing alerts are treated as already confirmed so the
-- cron keeps firing for current subscribers.
UPDATE "job_alerts"
SET "confirmed_at" = "created_at"
WHERE "confirmed_at" IS NULL AND "is_active" = TRUE;

-- Flip the column default for inserts going forward. Does not affect
-- existing rows.
ALTER TABLE "job_alerts" ALTER COLUMN "is_active" SET DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS "job_alerts_confirmation_token_key"
    ON "job_alerts" ("confirmation_token");

CREATE INDEX IF NOT EXISTS "job_alerts_confirmed_at_idx"
    ON "job_alerts" ("confirmed_at");
