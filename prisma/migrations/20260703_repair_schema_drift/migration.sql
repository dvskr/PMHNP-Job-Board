-- Repair migration (2026-07-03): close the schema.prisma ↔ migrations drift.
--
-- 41 columns across 8 tables (plus 3 indexes, 1 FK, and one nullability
-- change) existed on production only via `prisma db push` — no migration
-- created them, so `prisma migrate deploy` on a fresh database produced a
-- schema the Prisma client crashes on (P2022). Every statement here is
-- idempotent (IF NOT EXISTS / guarded DO blocks), so this is a no-op on
-- production and constructive on fresh databases.
--
-- employer_jobs.pricing_tier is intentionally NOT here: it must exist before
-- 20260430_normalize_pricing_tier_to_pro runs, so it lives in the pre-dated
-- 20260430_add_pricing_tier_column migration instead.
--
-- Column types/defaults mirror schema.prisma exactly (Prisma DDL mapping:
-- String→TEXT, DateTime→TIMESTAMP(3), Json→JSONB, String[]→TEXT[]).

-- ── jobs ────────────────────────────────────────────────────────────────────
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "experience_level" TEXT,
  ADD COLUMN IF NOT EXISTS "apply_on_platform" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_manually_unpublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "clinical_setting" TEXT,
  ADD COLUMN IF NOT EXISTS "patient_population" TEXT,
  ADD COLUMN IF NOT EXISTS "quality_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_link_checked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_enriched_at" TIMESTAMP(3);

-- schema.prisma declares Job.applyLink as String? but 0_init created it
-- NOT NULL; prod was relaxed via db push. Align fresh databases.
ALTER TABLE "jobs" ALTER COLUMN "apply_link" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "jobs_quality_score_idx" ON "jobs"("quality_score" DESC);

-- ── email_leads ─────────────────────────────────────────────────────────────
ALTER TABLE "email_leads"
  ADD COLUMN IF NOT EXISTS "is_suppressed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "suppressed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suppression_reason" TEXT;

-- ── employer_jobs (pricing_tier handled by the pre-dated migration) ────────
ALTER TABLE "employer_jobs"
  ADD COLUMN IF NOT EXISTS "notify_on_application" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_digest" TEXT NOT NULL DEFAULT 'instant';

-- ── user_profiles ───────────────────────────────────────────────────────────
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "email_suppressed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "resume_parsed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resume_parse_status" TEXT,
  ADD COLUMN IF NOT EXISTS "last_nudged_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_saved_job_reminder_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "email_suppressed_at" TIMESTAMP(3);

-- ── job_applications ────────────────────────────────────────────────────────
ALTER TABLE "job_applications"
  ADD COLUMN IF NOT EXISTS "cover_letter" TEXT,
  ADD COLUMN IF NOT EXISTS "cover_letter_url" TEXT,
  ADD COLUMN IF NOT EXISTS "resume_url" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "status_updated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consent_given" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consent_given_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "withdrawn_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ai_match_score" INTEGER,
  ADD COLUMN IF NOT EXISTS "ai_match_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "ai_missing_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "screening_answers" JSONB;

CREATE INDEX IF NOT EXISTS "job_applications_status_idx" ON "job_applications"("status");

-- ── profile_views ───────────────────────────────────────────────────────────
ALTER TABLE "profile_views" ADD COLUMN IF NOT EXISTS "employer_job_id" TEXT;

CREATE INDEX IF NOT EXISTS "profile_views_employer_job_id_idx" ON "profile_views"("employer_job_id");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profile_views_employer_job_id_fkey'
  ) THEN
    ALTER TABLE "profile_views"
      ADD CONSTRAINT "profile_views_employer_job_id_fkey"
      FOREIGN KEY ("employer_job_id") REFERENCES "employer_jobs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── blog_posts ──────────────────────────────────────────────────────────────
ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "youtube_video_id" TEXT,
  ADD COLUMN IF NOT EXISTS "video_url" TEXT;

-- ── candidate_education ─────────────────────────────────────────────────────
ALTER TABLE "candidate_education" ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP(3);

-- ── employer_testimonials ───────────────────────────────────────────────────
-- schema.prisma's displayAs field had no @map, so the 20260501 migration
-- created snake_case display_as and a later `db push` ADDED camelCase
-- "displayAs" alongside it — prod verified 2026-07-06 to carry BOTH (0 rows,
-- so no data divergence today). schema.prisma now maps to display_as;
-- converge every possible column state onto display_as:
--   both exist    → copy any real values across, drop the camelCase orphan
--   camelCase only → rename to display_as
--   snake only / fresh DB → nothing to do
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employer_testimonials'
      AND column_name = 'displayAs'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'employer_testimonials'
        AND column_name = 'display_as'
    ) THEN
      UPDATE "employer_testimonials"
        SET "display_as" = "displayAs"
        WHERE "displayAs" IS DISTINCT FROM "display_as";
      ALTER TABLE "employer_testimonials" DROP COLUMN "displayAs";
    ELSE
      ALTER TABLE "employer_testimonials" RENAME COLUMN "displayAs" TO "display_as";
    END IF;
  END IF;
END $$;

-- ── reverse drift: migration-created objects prod no longer has ─────────────
-- 0_init creates 14 user_profiles columns, 12 candidate_work_experience
-- columns, and the candidate_documents table that schema.prisma does not
-- declare and prod does NOT carry (verified absent 2026-07-06 — a past
-- `db push` dropped them, so there is no data anywhere to preserve).
-- Dropping them here is a no-op on prod and aligns fresh databases with
-- both prod and schema.prisma, so `migrate diff` stays clean.
ALTER TABLE "user_profiles"
  DROP COLUMN IF EXISTS "dea_schedule_authority",
  DROP COLUMN IF EXISTS "state_controlled_substance_reg",
  DROP COLUMN IF EXISTS "state_csr_expiration_date",
  DROP COLUMN IF EXISTS "pmp_registered",
  DROP COLUMN IF EXISTS "malpractice_carrier",
  DROP COLUMN IF EXISTS "malpractice_policy_number",
  DROP COLUMN IF EXISTS "malpractice_coverage",
  DROP COLUMN IF EXISTS "malpractice_claims_history",
  DROP COLUMN IF EXISTS "malpractice_claims_details",
  DROP COLUMN IF EXISTS "full_practice_authority",
  DROP COLUMN IF EXISTS "collaborative_agreement_req",
  DROP COLUMN IF EXISTS "collaborating_physician_name",
  DROP COLUMN IF EXISTS "collaborating_physician_contact",
  DROP COLUMN IF EXISTS "prescriptive_authority_status";

ALTER TABLE "candidate_work_experience"
  DROP COLUMN IF EXISTS "patient_volume",
  DROP COLUMN IF EXISTS "patient_populations",
  DROP COLUMN IF EXISTS "treatment_modalities",
  DROP COLUMN IF EXISTS "disorders_treated",
  DROP COLUMN IF EXISTS "telehealth_experience",
  DROP COLUMN IF EXISTS "telehealth_platforms",
  DROP COLUMN IF EXISTS "ehr_systems",
  DROP COLUMN IF EXISTS "prescribing_exp",
  DROP COLUMN IF EXISTS "prescribing_schedules",
  DROP COLUMN IF EXISTS "assessment_tools",
  DROP COLUMN IF EXISTS "supervisory_role",
  DROP COLUMN IF EXISTS "supervisory_details";

DROP TABLE IF EXISTS "candidate_documents";
