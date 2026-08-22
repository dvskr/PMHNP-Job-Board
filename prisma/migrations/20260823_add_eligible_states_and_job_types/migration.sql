-- Job-side structured eligibility + multi-schedule storage (2026-08 external
-- audit follow-up). eligible_state_codes lists the states a remote role is
-- restricted to (empty = nationwide); job_types holds every schedule the
-- posting offers while job_type stays the single primary facet value.
ALTER TABLE "jobs" ADD COLUMN "eligible_state_codes" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "jobs" ADD COLUMN "job_types" TEXT[] NOT NULL DEFAULT '{}';
