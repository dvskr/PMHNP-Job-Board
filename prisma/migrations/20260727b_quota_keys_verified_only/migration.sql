-- Narrow quota_keys to SESSION-VERIFIED signals only (2026-07-27, follow-up).
--
-- The first migration backfilled keys derived from the form-submitted contact
-- email as well. Adversarial review showed unverified signals must never block:
--   * poisoning  - posting one free job with a rival's contact address would
--                  permanently consume that rival's free post;
--   * collisions - shared ATS / site-builder domains would refuse unrelated
--                  clinics their first free post.
--
-- The blocking model is now exactly: acct:<supabase user id> (immune to email
-- changes, which is the leak that started this) and dom:<signup email domain>
-- (the original one-free-post-per-company rule). This rewrites existing rows
-- to that model and drops the now-inert email: keys. Deduplicated, because
-- ARRAY_REMOVE does not dedupe and the first backfill could emit the same
-- dom: value twice.

UPDATE "employer_jobs"
SET "quota_keys" = (
  SELECT COALESCE(ARRAY_AGG(DISTINCT k), '{}')
  FROM UNNEST(
    ARRAY_REMOVE(ARRAY[
      CASE WHEN "user_id" IS NOT NULL AND btrim("user_id") <> ''
           THEN 'acct:' || lower(btrim("user_id")) END,
      CASE WHEN "quota_domain" IS NOT NULL AND btrim("quota_domain") <> ''
           THEN 'dom:' || lower(btrim("quota_domain")) END
    ], NULL)
  ) AS k
);
