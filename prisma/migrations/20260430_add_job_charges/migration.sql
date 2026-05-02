-- Audit #2: Per-charge ledger for paid job postings.
-- Replaces the broken invoice-by-EmployerJob lookup that always printed $199
-- regardless of whether the row was a new post or a renewal (which costs $179).
-- One row per Stripe checkout. Invoices are now generated from this ledger so
-- the charged amount on each invoice matches what Stripe actually billed.

CREATE TABLE "job_charges" (
    "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "employer_job_id"   TEXT NOT NULL,
    "stripe_session_id" TEXT NOT NULL,
    "amount_cents"      INTEGER NOT NULL,
    "currency"          TEXT NOT NULL DEFAULT 'usd',
    "type"              TEXT NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "job_charges_stripe_session_id_key"
    ON "job_charges"("stripe_session_id");

CREATE INDEX "job_charges_employer_job_id_idx"
    ON "job_charges"("employer_job_id");

CREATE INDEX "job_charges_type_idx"
    ON "job_charges"("type");
