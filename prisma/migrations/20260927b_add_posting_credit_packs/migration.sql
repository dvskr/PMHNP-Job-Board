-- Prepaid posting credits for agencies that post continuously.
--
-- A pack is ONE Stripe payment funding N postings, so it cannot ride the
-- job_charges ledger, which is keyed to a single employer_job_id.

CREATE TABLE "posting_credit_packs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quota_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stripe_session_id" TEXT NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "credits_total" INTEGER NOT NULL,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posting_credit_packs_pkey" PRIMARY KEY ("id")
);

-- One pack per Checkout session, so a replayed webhook cannot mint a second.
CREATE UNIQUE INDEX "posting_credit_packs_stripe_session_id_key"
    ON "posting_credit_packs"("stripe_session_id");

-- Lets charge.refunded find the pack from the payment intent, the same way
-- it already finds a job charge.
CREATE UNIQUE INDEX "posting_credit_packs_stripe_payment_intent_id_key"
    ON "posting_credit_packs"("stripe_payment_intent_id");

CREATE INDEX "posting_credit_packs_userId_expires_at_idx"
    ON "posting_credit_packs"("userId", "expires_at");

CREATE INDEX "posting_credit_packs_stripe_payment_intent_id_idx"
    ON "posting_credit_packs"("stripe_payment_intent_id");

-- How a post was paid for. payment_status stays 'paid' for both values:
-- a fourth payment status would pass the renewal route's denylist while
-- breaking invoice, receipt, toggle-publish, job sorting and the admin org
-- rollup, all of which test for 'paid' exactly.
ALTER TABLE "employer_jobs"
    ADD COLUMN "funding_source" TEXT NOT NULL DEFAULT 'stripe';

ALTER TABLE "employer_jobs" ADD COLUMN "credit_pack_id" TEXT;

CREATE INDEX "employer_jobs_credit_pack_id_idx" ON "employer_jobs"("credit_pack_id");

ALTER TABLE "employer_jobs"
    ADD CONSTRAINT "employer_jobs_credit_pack_id_fkey"
    FOREIGN KEY ("credit_pack_id") REFERENCES "posting_credit_packs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
