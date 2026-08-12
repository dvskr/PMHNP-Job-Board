-- Expiry-date FINAL notice: dedupe stamp for the second and last email of the
-- expiry sequence (/api/cron/expiry-warnings, 0 22 * * *). The 5-day warning
-- already dedupes on expiry_warning_sent_at; this is its own column so the two
-- sends can never suppress each other and each stays independently countable.
--
-- Written claim-first (stamped BEFORE the send, guarded by an
-- `expiry_final_notice_sent_at IS NULL` predicate in the same UPDATE), so a
-- concurrent or retried run loses the race cleanly instead of sending twice.
--
-- Forward-only, additive, idempotent. New rows default null, which means
-- "final notice not sent yet" for every existing posting. No backfill: the
-- only rows the cron can pick up are ones whose expires_at lands inside the
-- run's own UTC day, so historic postings are not retroactively emailed.
--
-- No index: the cron's driving predicate is jobs.expires_at (already indexed);
-- this column is only ever read as a null-check on the handful of employer_jobs
-- rows that survive that filter. Same reasoning as expiry_warning_sent_at,
-- which has no index either.

ALTER TABLE "employer_jobs"
  ADD COLUMN IF NOT EXISTS "expiry_final_notice_sent_at" TIMESTAMP(3);
