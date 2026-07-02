-- Baseline repair: columns (+ their indexes) that exist on production only
-- via `prisma db push` and were never captured in a migration, so a fresh
-- `prisma migrate deploy` database lacked them and the Prisma client crashed
-- on first SELECT (P2022) or INSERT.
--
-- Companion to 20260611_create_missing_tables_baseline (which repaired
-- missing TABLES); this migration repairs missing COLUMNS. Enforced going
-- forward by tests/db/migrations-cover-schema.test.ts (column-level check).
--
-- Idempotent by construction: every ADD COLUMN / CREATE INDEX uses
-- IF NOT EXISTS and the one foreign key is wrapped in an existence guard,
-- so this is safe to run on the already-drifted production database AND on
-- a brand-new one. No DROPs of tables/columns/indexes, no data rewritten.
-- Types/defaults/nullability mirror prisma/schema.prisma exactly
-- (String→TEXT, Int→INTEGER, Boolean→BOOLEAN, DateTime→TIMESTAMP(3),
-- Json→JSONB, String[]→TEXT[]; schema.prisma declares no enums). Every
-- required (non-nullable) column added here carries the schema's @default,
-- so existing rows backfill from the column default — no UPDATEs needed.

-- ── jobs ──────────────────────────────────────────────────────────────
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "experience_level"        TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "apply_on_platform"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "is_manually_unpublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "benefits"                TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "clinical_setting"        TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "patient_population"      TEXT;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "quality_score"           INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "last_link_checked_at"    TIMESTAMP(3);
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "last_enriched_at"        TIMESTAMP(3);

-- schema.prisma: @@index([qualityScore(sort: Desc)])
CREATE INDEX IF NOT EXISTS "jobs_quality_score_idx" ON "jobs"("quality_score" DESC);

-- Nullability repair: schema.prisma declares `applyLink String?` but 0_init
-- created "apply_link" NOT NULL. Production (db push) already has it
-- nullable, so this is a no-op there; on a migrations-only database it
-- unblocks inserts of jobs without an external apply link. Constraint
-- relaxation only — no object is dropped and no data is modified.
ALTER TABLE "jobs" ALTER COLUMN "apply_link" DROP NOT NULL;

-- ── email_leads ───────────────────────────────────────────────────────
ALTER TABLE "email_leads" ADD COLUMN IF NOT EXISTS "is_suppressed"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "email_leads" ADD COLUMN IF NOT EXISTS "suppressed_at"      TIMESTAMP(3);
ALTER TABLE "email_leads" ADD COLUMN IF NOT EXISTS "suppression_reason" TEXT;

-- ── employer_jobs ─────────────────────────────────────────────────────
-- NOTE: 20260430_normalize_pricing_tier_to_pro UPDATEs pricing_tier but no
-- earlier migration ever created it — this ADD COLUMN is the first
-- migration-tracked definition. Default 'pro' matches both schema.prisma
-- and the post-normalization production state.
ALTER TABLE "employer_jobs" ADD COLUMN IF NOT EXISTS "pricing_tier"          TEXT NOT NULL DEFAULT 'pro';
ALTER TABLE "employer_jobs" ADD COLUMN IF NOT EXISTS "notify_on_application" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "employer_jobs" ADD COLUMN IF NOT EXISTS "notify_digest"         TEXT NOT NULL DEFAULT 'instant';

-- ── user_profiles ─────────────────────────────────────────────────────
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "email_suppressed"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "skills"                     TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "resume_parsed_at"           TIMESTAMP(3);
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "resume_parse_status"        TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "last_nudged_at"             TIMESTAMP(3);
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "last_saved_job_reminder_at" TIMESTAMP(3);
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "email_suppressed_at"        TIMESTAMP(3);

-- ── job_applications ──────────────────────────────────────────────────
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "cover_letter"      TEXT;
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "cover_letter_url"  TEXT;
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "resume_url"        TEXT;
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "status"            TEXT NOT NULL DEFAULT 'applied';
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "notes"             TEXT;
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "status_updated_at" TIMESTAMP(3);
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "consent_given"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "consent_given_at"  TIMESTAMP(3);
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "withdrawn_at"      TIMESTAMP(3);
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "ai_match_score"    INTEGER;
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "ai_match_reasons"  TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "ai_missing_items"  TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "screening_answers" JSONB;

-- schema.prisma: @@index([status])
CREATE INDEX IF NOT EXISTS "job_applications_status_idx" ON "job_applications"("status");

-- ── profile_views ─────────────────────────────────────────────────────
ALTER TABLE "profile_views" ADD COLUMN IF NOT EXISTS "employer_job_id" TEXT;

-- schema.prisma: @@index([employerJobId])
CREATE INDEX IF NOT EXISTS "profile_views_employer_job_id_idx" ON "profile_views"("employer_job_id");

-- schema.prisma: employerJob EmployerJob? @relation(..., onDelete: SetNull)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profile_views_employer_job_id_fkey') THEN
    ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_employer_job_id_fkey" FOREIGN KEY ("employer_job_id") REFERENCES "employer_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── blog_posts ────────────────────────────────────────────────────────
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "image_url"        TEXT;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "youtube_video_id" TEXT;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "video_url"        TEXT;

-- ── candidate_education ───────────────────────────────────────────────
ALTER TABLE "candidate_education" ADD COLUMN IF NOT EXISTS "start_date" TIMESTAMP(3);

-- ── employer_testimonials ─────────────────────────────────────────────
-- schema.prisma declares `displayAs String @default("initial")` with NO
-- @map, so the Prisma client reads/writes the camelCase column "displayAs".
-- Migration 20260501_feedback_userid_and_testimonials created the snake_case
-- "display_as" instead (never matched the schema). Production, shaped by
-- `db push`, has "displayAs". We add the column the client actually uses;
-- the orphaned "display_as" from the old migration is intentionally left in
-- place on migrations-built databases (no DROPs in this migration).
ALTER TABLE "employer_testimonials" ADD COLUMN IF NOT EXISTS "displayAs" TEXT NOT NULL DEFAULT 'initial';
