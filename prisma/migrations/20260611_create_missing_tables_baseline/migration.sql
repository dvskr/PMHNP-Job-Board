-- Repair migration: create 18 tables that exist in schema.prisma but were
-- never written to a migration (they were created on prod via `db push`,
-- which left `prisma migrate deploy` unable to build a fresh database).
--
-- Idempotent by construction: CREATE TABLE/INDEX use IF NOT EXISTS and every
-- foreign key is wrapped in an existence guard, so this is safe to run on
-- the already-migrated production database AND on a brand-new one.

CREATE TABLE IF NOT EXISTS "job_view_events" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT,
    "referrer" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "job_view_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "participant_a" TEXT NOT NULL,
    "participant_b" TEXT NOT NULL,
    "job_id" TEXT,
    "subject" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by_a" BOOLEAN NOT NULL DEFAULT false,
    "deleted_by_b" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "employer_messages" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "job_id" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_url" TEXT,
    "attachment_name" TEXT,
    "deleted_by_sender" BOOLEAN NOT NULL DEFAULT false,
    "deleted_by_recipient" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "employer_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "youtube_videos" (
    "id" TEXT NOT NULL,
    "state_key" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "blog_slug" TEXT NOT NULL,
    "yt_title" TEXT NOT NULL,
    "yt_description" TEXT NOT NULL,
    "yt_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seo_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnail_url" TEXT,
    "video_url" TEXT,
    "youtube_video_id" TEXT,
    "postiz_post_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduled_date" TIMESTAMP(3),
    "published_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_videos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "job_screening_questions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_knockout" BOOLEAN NOT NULL DEFAULT false,
    "knockout_answer" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_screening_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "job_reports" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "ip_hash" TEXT,
    "reporter_email" TEXT,
    "reporter_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "rating" INTEGER NOT NULL,
    "message" TEXT,
    "page" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "autofill_telemetry" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "ats_domain" TEXT,
    "field_name" TEXT NOT NULL,
    "field_label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "match_method" TEXT NOT NULL,
    "profile_key" TEXT,
    "value_sample" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "filled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autofill_telemetry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "rejected_jobs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employer" TEXT,
    "location" TEXT,
    "apply_link" TEXT,
    "external_id" TEXT,
    "source_provider" TEXT NOT NULL,
    "rejection_reason" TEXT NOT NULL,
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rejected_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "saved_candidates" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "employer_job_id" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "employer_candidate_alerts" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "specialties" TEXT,
    "states" TEXT,
    "min_experience" INTEGER,
    "work_mode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employer_candidate_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_broadcasts" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "audience_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "email_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "saved_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_sends" (
    "id" TEXT NOT NULL,
    "resend_id" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PseoStats" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "locationSlug" TEXT NOT NULL,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "rawAvgSalary" INTEGER NOT NULL DEFAULT 0,
    "colAdjustedSalary" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PseoStats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "job_view_events_job_id_idx" ON "job_view_events"("job_id");
CREATE INDEX IF NOT EXISTS "job_view_events_timestamp_idx" ON "job_view_events"("timestamp");
CREATE INDEX IF NOT EXISTS "job_view_events_job_id_timestamp_idx" ON "job_view_events"("job_id", "timestamp");
CREATE INDEX IF NOT EXISTS "conversations_participant_a_last_message_at_idx" ON "conversations"("participant_a", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "conversations_participant_b_last_message_at_idx" ON "conversations"("participant_b", "last_message_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_participant_a_participant_b_job_id_key" ON "conversations"("participant_a", "participant_b", "job_id");
CREATE INDEX IF NOT EXISTS "employer_messages_sender_id_idx" ON "employer_messages"("sender_id");
CREATE INDEX IF NOT EXISTS "employer_messages_recipient_id_idx" ON "employer_messages"("recipient_id");
CREATE INDEX IF NOT EXISTS "employer_messages_conversation_id_idx" ON "employer_messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "employer_messages_job_id_idx" ON "employer_messages"("job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_videos_state_key_key" ON "youtube_videos"("state_key");
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_videos_blog_slug_key" ON "youtube_videos"("blog_slug");
CREATE INDEX IF NOT EXISTS "youtube_videos_status_idx" ON "youtube_videos"("status");
CREATE INDEX IF NOT EXISTS "youtube_videos_state_key_idx" ON "youtube_videos"("state_key");
CREATE INDEX IF NOT EXISTS "job_screening_questions_job_id_idx" ON "job_screening_questions"("job_id");
CREATE INDEX IF NOT EXISTS "job_reports_job_id_idx" ON "job_reports"("job_id");
CREATE INDEX IF NOT EXISTS "user_feedback_user_id_idx" ON "user_feedback"("user_id");
CREATE INDEX IF NOT EXISTS "autofill_telemetry_user_id_idx" ON "autofill_telemetry"("user_id");
CREATE INDEX IF NOT EXISTS "autofill_telemetry_match_method_idx" ON "autofill_telemetry"("match_method");
CREATE INDEX IF NOT EXISTS "autofill_telemetry_field_name_idx" ON "autofill_telemetry"("field_name");
CREATE INDEX IF NOT EXISTS "autofill_telemetry_created_at_idx" ON "autofill_telemetry"("created_at");
CREATE INDEX IF NOT EXISTS "rejected_jobs_source_provider_idx" ON "rejected_jobs"("source_provider");
CREATE INDEX IF NOT EXISTS "rejected_jobs_rejection_reason_idx" ON "rejected_jobs"("rejection_reason");
CREATE INDEX IF NOT EXISTS "rejected_jobs_created_at_idx" ON "rejected_jobs"("created_at");
CREATE INDEX IF NOT EXISTS "saved_candidates_employer_id_idx" ON "saved_candidates"("employer_id");
CREATE INDEX IF NOT EXISTS "saved_candidates_employer_job_id_idx" ON "saved_candidates"("employer_job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "saved_candidates_employer_id_candidate_id_employer_job_id_key" ON "saved_candidates"("employer_id", "candidate_id", "employer_job_id");
CREATE INDEX IF NOT EXISTS "employer_candidate_alerts_employer_id_idx" ON "employer_candidate_alerts"("employer_id");
CREATE INDEX IF NOT EXISTS "employer_candidate_alerts_is_active_idx" ON "employer_candidate_alerts"("is_active");
CREATE INDEX IF NOT EXISTS "email_broadcasts_status_idx" ON "email_broadcasts"("status");
CREATE INDEX IF NOT EXISTS "email_broadcasts_scheduled_for_idx" ON "email_broadcasts"("scheduled_for");
CREATE INDEX IF NOT EXISTS "email_broadcast_recipients_broadcast_id_idx" ON "email_broadcast_recipients"("broadcast_id");
CREATE INDEX IF NOT EXISTS "email_broadcast_recipients_status_idx" ON "email_broadcast_recipients"("status");
CREATE INDEX IF NOT EXISTS "saved_jobs_user_id_idx" ON "saved_jobs"("user_id");
CREATE INDEX IF NOT EXISTS "saved_jobs_job_id_idx" ON "saved_jobs"("job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "saved_jobs_user_id_job_id_key" ON "saved_jobs"("user_id", "job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");
CREATE INDEX IF NOT EXISTS "email_sends_to_idx" ON "email_sends"("to");
CREATE INDEX IF NOT EXISTS "email_sends_email_type_idx" ON "email_sends"("email_type");
CREATE INDEX IF NOT EXISTS "email_sends_status_idx" ON "email_sends"("status");
CREATE INDEX IF NOT EXISTS "email_sends_created_at_idx" ON "email_sends"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "PseoStats_type_locationSlug_idx" ON "PseoStats"("type", "locationSlug");
CREATE INDEX IF NOT EXISTS "PseoStats_categorySlug_idx" ON "PseoStats"("categorySlug");
CREATE UNIQUE INDEX IF NOT EXISTS "PseoStats_type_categorySlug_locationSlug_key" ON "PseoStats"("type", "categorySlug", "locationSlug");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_view_events_job_id_fkey') THEN
    ALTER TABLE "job_view_events" ADD CONSTRAINT "job_view_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_participant_a_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_a_fkey" FOREIGN KEY ("participant_a") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_participant_b_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_b_fkey" FOREIGN KEY ("participant_b") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_job_id_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_messages_sender_id_fkey') THEN
    ALTER TABLE "employer_messages" ADD CONSTRAINT "employer_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_messages_recipient_id_fkey') THEN
    ALTER TABLE "employer_messages" ADD CONSTRAINT "employer_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_messages_conversation_id_fkey') THEN
    ALTER TABLE "employer_messages" ADD CONSTRAINT "employer_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_messages_job_id_fkey') THEN
    ALTER TABLE "employer_messages" ADD CONSTRAINT "employer_messages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_screening_questions_job_id_fkey') THEN
    ALTER TABLE "job_screening_questions" ADD CONSTRAINT "job_screening_questions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_reports_job_id_fkey') THEN
    ALTER TABLE "job_reports" ADD CONSTRAINT "job_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'autofill_telemetry_user_id_fkey') THEN
    ALTER TABLE "autofill_telemetry" ADD CONSTRAINT "autofill_telemetry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_candidates_employer_id_fkey') THEN
    ALTER TABLE "saved_candidates" ADD CONSTRAINT "saved_candidates_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_candidates_candidate_id_fkey') THEN
    ALTER TABLE "saved_candidates" ADD CONSTRAINT "saved_candidates_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_candidates_employer_job_id_fkey') THEN
    ALTER TABLE "saved_candidates" ADD CONSTRAINT "saved_candidates_employer_job_id_fkey" FOREIGN KEY ("employer_job_id") REFERENCES "employer_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employer_candidate_alerts_employer_id_fkey') THEN
    ALTER TABLE "employer_candidate_alerts" ADD CONSTRAINT "employer_candidate_alerts_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_broadcasts_template_id_fkey') THEN
    ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_broadcast_recipients_broadcast_id_fkey') THEN
    ALTER TABLE "email_broadcast_recipients" ADD CONSTRAINT "email_broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "email_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
