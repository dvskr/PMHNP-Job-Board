-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "employer" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "job_type" TEXT,
    "mode" TEXT,
    "description" TEXT NOT NULL,
    "description_summary" TEXT,
    "salary_range" TEXT,
    "min_salary" INTEGER,
    "max_salary" INTEGER,
    "salary_period" TEXT,
    "city" TEXT,
    "state" TEXT,
    "state_code" TEXT,
    "country" TEXT DEFAULT 'US',
    "is_remote" BOOLEAN NOT NULL DEFAULT false,
    "is_hybrid" BOOLEAN NOT NULL DEFAULT false,
    "normalized_min_salary" INTEGER,
    "normalized_max_salary" INTEGER,
    "salary_is_estimated" BOOLEAN NOT NULL DEFAULT false,
    "salary_confidence" DOUBLE PRECISION,
    "display_salary" TEXT,
    "apply_link" TEXT NOT NULL,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "is_verified_employer" BOOLEAN NOT NULL DEFAULT false,
    "source_type" TEXT,
    "source_provider" TEXT,
    "external_id" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "apply_click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "company_id" TEXT,
    "original_posted_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT,
    "is_subscribed" BOOLEAN NOT NULL DEFAULT true,
    "newsletter_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribe_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_alerts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "keyword" TEXT,
    "location" TEXT,
    "mode" TEXT,
    "job_type" TEXT,
    "min_salary" INTEGER,
    "max_salary" INTEGER,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at" TIMESTAMP(3),
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_jobs" (
    "id" TEXT NOT NULL,
    "employer_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "company_logo_url" TEXT,
    "company_description" TEXT,
    "company_website" TEXT,
    "job_id" TEXT NOT NULL,
    "edit_token" TEXT NOT NULL,
    "dashboard_token" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expiry_warning_sent_at" TIMESTAMP(3),
    "user_id" TEXT,

    CONSTRAINT "employer_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_stats" (
    "id" TEXT NOT NULL,
    "total_jobs" INTEGER NOT NULL DEFAULT 0,
    "total_subscribers" INTEGER NOT NULL DEFAULT 0,
    "total_companies" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_drafts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "form_data" JSONB NOT NULL,
    "resume_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logo_url" TEXT,
    "website" TEXT,
    "description" TEXT,
    "job_count" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_stats" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "jobs_fetched" INTEGER NOT NULL DEFAULT 0,
    "jobs_added" INTEGER NOT NULL DEFAULT 0,
    "jobs_duplicate" INTEGER NOT NULL DEFAULT 0,
    "jobs_expired" INTEGER NOT NULL DEFAULT 0,
    "avg_quality_score" DOUBLE PRECISION,
    "total_views" INTEGER NOT NULL DEFAULT 0,
    "total_apply_clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apply_clicks" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "source" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT,
    "referrer" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "apply_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_leads" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_title" TEXT,
    "website" TEXT,
    "linkedin_url" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "source" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "jobs_posted" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "supabase_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'job_seeker',
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "resume_url" TEXT,
    "avatar_url" TEXT,
    "headline" TEXT,
    "years_experience" INTEGER,
    "certifications" TEXT,
    "license_states" TEXT,
    "specialties" TEXT,
    "bio" TEXT,
    "linkedin_url" TEXT,
    "preferred_work_mode" TEXT,
    "preferred_job_type" TEXT,
    "desired_salary_min" INTEGER,
    "desired_salary_max" INTEGER,
    "desired_salary_type" TEXT,
    "available_date" TIMESTAMP(3),
    "open_to_offers" BOOLEAN NOT NULL DEFAULT true,
    "profile_visible" BOOLEAN NOT NULL DEFAULT true,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "country" TEXT DEFAULT 'US',
    "work_authorized" BOOLEAN,
    "requires_sponsorship" BOOLEAN,
    "veteran_status" TEXT,
    "disability_status" TEXT,
    "race_ethnicity" TEXT,
    "gender" TEXT,
    "npi_number" TEXT,
    "dea_number" TEXT,
    "dea_expiration_date" TIMESTAMP(3),
    "dea_schedule_authority" TEXT,
    "state_controlled_substance_reg" TEXT,
    "state_csr_expiration_date" TIMESTAMP(3),
    "pmp_registered" BOOLEAN,
    "malpractice_carrier" TEXT,
    "malpractice_policy_number" TEXT,
    "malpractice_coverage" TEXT,
    "malpractice_claims_history" BOOLEAN,
    "malpractice_claims_details" TEXT,
    "full_practice_authority" BOOLEAN,
    "collaborative_agreement_req" BOOLEAN,
    "collaborating_physician_name" TEXT,
    "collaborating_physician_contact" TEXT,
    "prescriptive_authority_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "source_url" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_views" (
    "id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta_description" TEXT,
    "target_keyword" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publish_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_licenses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "license_type" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_state" TEXT NOT NULL,
    "expiration_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_certifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "certification_name" TEXT NOT NULL,
    "certifying_body" TEXT,
    "certification_number" TEXT,
    "expiration_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_education" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "degree_type" TEXT NOT NULL,
    "field_of_study" TEXT,
    "school_name" TEXT NOT NULL,
    "graduation_date" TIMESTAMP(3),
    "gpa" TEXT,
    "is_highest_degree" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_work_experience" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "employer_name" TEXT NOT NULL,
    "employer_city" TEXT,
    "employer_state" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "supervisor_name" TEXT,
    "supervisor_phone" TEXT,
    "supervisor_email" TEXT,
    "may_contact" BOOLEAN,
    "reason_for_leaving" TEXT,
    "description" TEXT,
    "patient_volume" TEXT,
    "patient_populations" TEXT,
    "treatment_modalities" TEXT,
    "disorders_treated" TEXT,
    "practice_setting" TEXT,
    "telehealth_experience" BOOLEAN,
    "telehealth_platforms" TEXT,
    "ehr_systems" TEXT,
    "prescribing_exp" BOOLEAN,
    "prescribing_schedules" TEXT,
    "assessment_tools" TEXT,
    "supervisory_role" BOOLEAN,
    "supervisory_details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_work_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_screening_answers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_key" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "answer_type" TEXT NOT NULL,
    "answer_bool" BOOLEAN,
    "answer_text" TEXT,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_screening_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_open_ended_responses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_key" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_open_ended_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_label" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "expiration_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_references" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "title" TEXT,
    "organization" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "relationship" TEXT,
    "years_known" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autofill_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "page_url" TEXT NOT NULL,
    "ats_name" TEXT,
    "fields_filled" INTEGER NOT NULL DEFAULT 0,
    "ai_generations" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autofill_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_slug_key" ON "jobs"("slug");

-- CreateIndex
CREATE INDEX "jobs_is_published_idx" ON "jobs"("is_published");

-- CreateIndex
CREATE INDEX "jobs_is_featured_idx" ON "jobs"("is_featured");

-- CreateIndex
CREATE INDEX "jobs_location_idx" ON "jobs"("location");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "jobs_min_salary_max_salary_idx" ON "jobs"("min_salary", "max_salary");

-- CreateIndex
CREATE INDEX "jobs_state_idx" ON "jobs"("state");

-- CreateIndex
CREATE INDEX "jobs_is_remote_idx" ON "jobs"("is_remote");

-- CreateIndex
CREATE INDEX "jobs_company_id_idx" ON "jobs"("company_id");

-- CreateIndex
CREATE INDEX "jobs_slug_idx" ON "jobs"("slug");

-- CreateIndex
CREATE INDEX "jobs_external_id_source_provider_idx" ON "jobs"("external_id", "source_provider");

-- CreateIndex
CREATE UNIQUE INDEX "email_leads_email_key" ON "email_leads"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_leads_unsubscribe_token_key" ON "email_leads"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "email_leads_email_idx" ON "email_leads"("email");

-- CreateIndex
CREATE INDEX "email_leads_unsubscribe_token_idx" ON "email_leads"("unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "job_alerts_token_key" ON "job_alerts"("token");

-- CreateIndex
CREATE INDEX "job_alerts_email_idx" ON "job_alerts"("email");

-- CreateIndex
CREATE INDEX "job_alerts_token_idx" ON "job_alerts"("token");

-- CreateIndex
CREATE INDEX "job_alerts_is_active_idx" ON "job_alerts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "employer_jobs_job_id_key" ON "employer_jobs"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "employer_jobs_edit_token_key" ON "employer_jobs"("edit_token");

-- CreateIndex
CREATE UNIQUE INDEX "employer_jobs_dashboard_token_key" ON "employer_jobs"("dashboard_token");

-- CreateIndex
CREATE INDEX "employer_jobs_user_id_idx" ON "employer_jobs"("user_id");

-- CreateIndex
CREATE INDEX "employer_jobs_edit_token_idx" ON "employer_jobs"("edit_token");

-- CreateIndex
CREATE INDEX "employer_jobs_contact_email_idx" ON "employer_jobs"("contact_email");

-- CreateIndex
CREATE INDEX "employer_jobs_dashboard_token_idx" ON "employer_jobs"("dashboard_token");

-- CreateIndex
CREATE UNIQUE INDEX "job_drafts_resume_token_key" ON "job_drafts"("resume_token");

-- CreateIndex
CREATE INDEX "job_drafts_email_idx" ON "job_drafts"("email");

-- CreateIndex
CREATE INDEX "job_drafts_resume_token_idx" ON "job_drafts"("resume_token");

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "companies_normalized_name_key" ON "companies"("normalized_name");

-- CreateIndex
CREATE INDEX "companies_normalized_name_idx" ON "companies"("normalized_name");

-- CreateIndex
CREATE INDEX "companies_is_verified_idx" ON "companies"("is_verified");

-- CreateIndex
CREATE INDEX "source_stats_source_idx" ON "source_stats"("source");

-- CreateIndex
CREATE INDEX "source_stats_date_idx" ON "source_stats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "source_stats_source_date_key" ON "source_stats"("source", "date");

-- CreateIndex
CREATE INDEX "apply_clicks_job_id_idx" ON "apply_clicks"("job_id");

-- CreateIndex
CREATE INDEX "apply_clicks_source_idx" ON "apply_clicks"("source");

-- CreateIndex
CREATE INDEX "apply_clicks_timestamp_idx" ON "apply_clicks"("timestamp");

-- CreateIndex
CREATE INDEX "employer_leads_status_idx" ON "employer_leads"("status");

-- CreateIndex
CREATE INDEX "employer_leads_company_name_idx" ON "employer_leads"("company_name");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_supabase_id_key" ON "user_profiles"("supabase_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");

-- CreateIndex
CREATE INDEX "user_profiles_supabase_id_idx" ON "user_profiles"("supabase_id");

-- CreateIndex
CREATE INDEX "user_profiles_email_idx" ON "user_profiles"("email");

-- CreateIndex
CREATE INDEX "user_profiles_profile_visible_open_to_offers_role_idx" ON "user_profiles"("profile_visible", "open_to_offers", "role");

-- CreateIndex
CREATE INDEX "job_applications_user_id_idx" ON "job_applications"("user_id");

-- CreateIndex
CREATE INDEX "job_applications_job_id_idx" ON "job_applications"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_user_id_job_id_key" ON "job_applications"("user_id", "job_id");

-- CreateIndex
CREATE INDEX "profile_views_viewer_id_idx" ON "profile_views"("viewer_id");

-- CreateIndex
CREATE INDEX "profile_views_candidate_id_idx" ON "profile_views"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_views_viewer_id_candidate_id_key" ON "profile_views"("viewer_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_publish_date_idx" ON "blog_posts"("status", "publish_date" DESC);

-- CreateIndex
CREATE INDEX "blog_posts_slug_idx" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_category_idx" ON "blog_posts"("category");

-- CreateIndex
CREATE INDEX "candidate_licenses_user_id_idx" ON "candidate_licenses"("user_id");

-- CreateIndex
CREATE INDEX "candidate_certifications_user_id_idx" ON "candidate_certifications"("user_id");

-- CreateIndex
CREATE INDEX "candidate_education_user_id_idx" ON "candidate_education"("user_id");

-- CreateIndex
CREATE INDEX "candidate_work_experience_user_id_idx" ON "candidate_work_experience"("user_id");

-- CreateIndex
CREATE INDEX "candidate_screening_answers_user_id_idx" ON "candidate_screening_answers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_screening_answers_user_id_question_key_key" ON "candidate_screening_answers"("user_id", "question_key");

-- CreateIndex
CREATE INDEX "candidate_open_ended_responses_user_id_idx" ON "candidate_open_ended_responses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_open_ended_responses_user_id_question_key_key" ON "candidate_open_ended_responses"("user_id", "question_key");

-- CreateIndex
CREATE INDEX "candidate_documents_user_id_idx" ON "candidate_documents"("user_id");

-- CreateIndex
CREATE INDEX "candidate_references_user_id_idx" ON "candidate_references"("user_id");

-- CreateIndex
CREATE INDEX "autofill_usage_user_id_idx" ON "autofill_usage"("user_id");

-- CreateIndex
CREATE INDEX "autofill_usage_user_id_created_at_idx" ON "autofill_usage"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_email_fkey" FOREIGN KEY ("email") REFERENCES "email_leads"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_jobs" ADD CONSTRAINT "employer_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_jobs" ADD CONSTRAINT "employer_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("supabase_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_clicks" ADD CONSTRAINT "apply_clicks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("supabase_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_licenses" ADD CONSTRAINT "candidate_licenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_certifications" ADD CONSTRAINT "candidate_certifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_work_experience" ADD CONSTRAINT "candidate_work_experience_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_screening_answers" ADD CONSTRAINT "candidate_screening_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_open_ended_responses" ADD CONSTRAINT "candidate_open_ended_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_documents" ADD CONSTRAINT "candidate_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_references" ADD CONSTRAINT "candidate_references_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autofill_usage" ADD CONSTRAINT "autofill_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

