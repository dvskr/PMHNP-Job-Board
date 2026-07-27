-- Free-post quota hardening (2026-07-27).
--
-- The old gate keyed the lifetime free post off quota_domain, which was
-- derived from the CURRENT account email at post time. Changing the account
-- email domain therefore produced a new key and a second free post (observed
-- in prod: one account, two signup domains over time).
--
-- quota_keys stores every identity signal for the poster so the gate can ask
-- "does any of my keys already exist on a free post?" in one indexed query.

ALTER TABLE "employer_jobs" ADD COLUMN "quota_keys" TEXT[] NOT NULL DEFAULT '{}';

-- Array-overlap (&&) is the gate's hot path.
CREATE INDEX "employer_jobs_quota_keys_idx" ON "employer_jobs" USING GIN ("quota_keys");

-- Backfill from data already on the row so historic free posts keep counting.
-- Mirrors lib/employer-quota.ts for the three signals expressible in SQL:
-- account id, company mail domain, and exact contact email. The normalized
-- employer-name key is intentionally left to the application backfill script
-- (scripts/backfill-employer-quota-keys.ts), which reuses the shared
-- normalizer so SQL and TypeScript cannot drift.
UPDATE "employer_jobs"
SET "quota_keys" = ARRAY_REMOVE(ARRAY[
    CASE WHEN "user_id" IS NOT NULL THEN 'acct:' || lower("user_id") END,
    CASE WHEN "quota_domain" IS NOT NULL THEN 'dom:' || lower("quota_domain") END,
    CASE
      WHEN "contact_email" LIKE '%@%'
       AND split_part(lower("contact_email"), '@', 2) NOT IN (
         'gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com',
         'icloud.com','mail.com','protonmail.com','ymail.com','live.com',
         'msn.com','googlemail.com','proton.me','gmx.com','yandex.com',
         'zoho.com','hey.com','fastmail.com','me.com','mac.com')
      THEN 'dom:' || split_part(lower("contact_email"), '@', 2)
    END,
    CASE WHEN "contact_email" LIKE '%@%' THEN 'email:' || lower("contact_email") END
  ], NULL)
WHERE "quota_keys" = '{}';
