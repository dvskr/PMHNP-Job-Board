-- Phase 5 #16 alignment: add experience filter fields to JobAlert so the
-- digest cron can respect the same "Open to new grads" + "I have N years"
-- semantics as the candidate-side filter on /jobs.
--
-- Forward-only, additive, idempotent.

ALTER TABLE "job_alerts"
  ADD COLUMN IF NOT EXISTS "new_grad_friendly" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "min_years_experience_filter" INTEGER;
