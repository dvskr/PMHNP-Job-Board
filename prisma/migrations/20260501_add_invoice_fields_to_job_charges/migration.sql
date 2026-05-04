-- Add invoice fields to job_charges so we can render Stripe-hosted invoice
-- URLs (PDF + web) inside our confirmation emails and the employer dashboard
-- without re-fetching the Invoice from Stripe on every read.
ALTER TABLE "job_charges"
  ADD COLUMN IF NOT EXISTS "stripe_invoice_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_pdf_url"    TEXT,
  ADD COLUMN IF NOT EXISTS "hosted_invoice_url" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_number"     TEXT;

-- Stripe invoice IDs are unique-ish per session but we don't need a UNIQUE
-- constraint since they're nullable and reads come via stripeSessionId. An
-- index speeds up admin lookups by invoice number.
CREATE INDEX IF NOT EXISTS "job_charges_stripe_invoice_id_idx"
  ON "job_charges" ("stripe_invoice_id");
