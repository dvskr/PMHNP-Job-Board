-- Lead-mining feature: extract phone numbers out of job descriptions
-- alongside emails / websites and store them on employer_leads.
--
-- Forward-only, additive — column is nullable.

ALTER TABLE "employer_leads"
    ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE INDEX IF NOT EXISTS "employer_leads_contact_email_idx"
    ON "employer_leads" ("contact_email");
