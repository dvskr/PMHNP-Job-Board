-- Program directors at PMHNP graduate programs. Distribution-side leads
-- seeded from the APNA Graduate Programs Directory (2026-05). Distinct
-- from employer_leads because the campaign motion, status state machine,
-- and offer (free embeddable jobs widget) differ.
--
-- See docs/runbooks/program-directors-campaign.md for the full campaign
-- plan; prisma/schema.prisma model ProgramDirectorLead for column docs.

CREATE TABLE "program_director_leads" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "university_name" TEXT NOT NULL,
    "director_name" TEXT,
    "email" TEXT,
    "email_status" TEXT,
    "phone" TEXT,
    "program_types" TEXT,
    "distance_education" TEXT,
    "program_website_url" TEXT,
    "linkedin_url" TEXT,
    "cohort_size" INTEGER,
    "graduation_month" TEXT,
    "outreach_status" TEXT NOT NULL DEFAULT 'not_contacted',
    "notes" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "widget_installed" BOOLEAN NOT NULL DEFAULT false,
    "widget_installed_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_director_leads_pkey" PRIMARY KEY ("id")
);

-- Idempotency anchor for the CSV import script: rerunning the import
-- upserts on (university_name, director_name) rather than duplicating
-- rows. Programs without a named director (NULL) are still upsertable
-- because Postgres treats NULL as distinct in unique constraints —
-- import script handles that case by matching on university_name alone.
CREATE UNIQUE INDEX "program_director_leads_university_director_uq"
    ON "program_director_leads" ("university_name", "director_name");

-- Funnel queries by outreach state ("how many in wave1_sent today?")
CREATE INDEX "program_director_leads_outreach_status_idx"
    ON "program_director_leads" ("outreach_status");

-- Wave segmentation queries ("send to all Tier 1 not yet contacted")
CREATE INDEX "program_director_leads_tier_idx"
    ON "program_director_leads" ("tier");

-- Widget personalization by state ("which PDs in CA have we contacted?")
CREATE INDEX "program_director_leads_state_idx"
    ON "program_director_leads" ("state");

-- Bounce-handling lookup ("which lead has this email?")
CREATE INDEX "program_director_leads_email_idx"
    ON "program_director_leads" ("email");
