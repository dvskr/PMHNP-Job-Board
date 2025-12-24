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

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT,
    "is_subscribed" BOOLEAN NOT NULL DEFAULT true,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_email_fkey" FOREIGN KEY ("email") REFERENCES "email_leads"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_jobs" ADD CONSTRAINT "employer_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_clicks" ADD CONSTRAINT "apply_clicks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
