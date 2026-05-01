-- Audit #28: refund tracking on the JobCharge ledger.
--
-- The webhook now subscribes to `charge.refunded` events from Stripe. When
-- a refund is issued (from Stripe Dashboard), the handler populates these
-- fields on the matching JobCharge row, flips EmployerJob.paymentStatus to
-- 'refunded', and emails the customer.
--
-- stripe_payment_intent_id is added so the refund webhook can match charges
-- back to JobCharge rows — `charge.refunded` events carry payment_intent
-- but not session_id directly. We backfill it for existing rows from Stripe
-- API at deploy time (or it stays NULL for rows created before this migration;
-- those rows won't auto-process refunds, which is fine — pre-deploy refunds
-- are zero by definition).

ALTER TABLE "job_charges"
  ADD COLUMN "stripe_payment_intent_id" TEXT,
  ADD COLUMN "refunded_at"              TIMESTAMP(3),
  ADD COLUMN "refunded_amount_cents"    INTEGER,
  ADD COLUMN "refund_reason"            TEXT;

CREATE UNIQUE INDEX "job_charges_stripe_payment_intent_id_key"
  ON "job_charges"("stripe_payment_intent_id");

CREATE INDEX "job_charges_refunded_at_idx"
  ON "job_charges"("refunded_at");
