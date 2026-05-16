-- Phase 0 of UI refresh runbook (docs/runbooks/ui-refresh-2026-05.md):
-- adds structured experience fields to support the post-job experience
-- picker, the JobCard chip, the candidate-side filter, and Schema.org's
-- JobPosting.experienceRequirements.
--
-- Design (locked 2026-05-13 in the runbook):
--   * min/maxYearsExperience drive filtering + Schema.org monthsOfExperience
--   * newGradFriendly is an independent flag (works alongside any min)
--   * experienceQualifier is an optional 80-char employer note,
--     displayed on the JD page only — never on cards
--   * experienceLabel is AUTO-GENERATED from the above three at write
--     time via lib/experience-label.ts. Used on cards and filter chips.
--
-- The legacy `experience_level` column is retained read-only as a fallback
-- for rows the backfill script can't confidently classify.
--
-- Forward-only, additive, idempotent.

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "min_years_experience" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_years_experience" INTEGER,
  ADD COLUMN IF NOT EXISTS "new_grad_friendly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "experience_qualifier" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "experience_label" TEXT;

-- Composite index for the two most common filter combinations:
--   /jobs?newGrad=true                   → (new_grad_friendly)
--   /jobs?minExperience=5                → (min_years_experience)
-- Combined into one index because Postgres can use a btree leading
-- column on either filter alone, AND on the AND-combination of both.
CREATE INDEX IF NOT EXISTS "jobs_new_grad_min_years_idx"
  ON "jobs" ("new_grad_friendly", "min_years_experience");
