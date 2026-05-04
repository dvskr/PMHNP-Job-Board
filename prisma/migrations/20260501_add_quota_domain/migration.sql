-- Audit #26 (final): per-domain free-post quota anchored to an immutable
-- snapshot field, not to contactEmail (mutable) or userId (nullable on
-- account delete).
--
-- The free-post quota rule remains: 2 free posts per email domain, lifetime.
-- HCA's 300 hospitals on @hcahealthcare.com share 2 freebies. Small clinics
-- get 2 freebies. The fix here is in HOW the rule is enforced — the count
-- now reads from a write-once field that no later operation (edit, delete,
-- account closure) can mutate.
--
-- Backfill strategy for existing rows:
--   - Free posts: derive quota_domain from contact_email (closest signal we
--     have for old rows; was the actual anchor pre-fix).
--   - Paid posts: leave NULL (they don't drive the quota).

BEGIN;

ALTER TABLE "employer_jobs"
  ADD COLUMN "quota_domain" TEXT;

UPDATE "employer_jobs"
SET "quota_domain" = LOWER(SPLIT_PART("contact_email", '@', 2))
WHERE "payment_status" = 'free'
  AND "contact_email" LIKE '%@%';

CREATE INDEX "employer_jobs_quota_domain_payment_status_idx"
  ON "employer_jobs"("quota_domain", "payment_status");

COMMIT;
