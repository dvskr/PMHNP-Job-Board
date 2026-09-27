-- Dedupe stamp for the credit expiry warning.
--
-- getCreditBalance already computes nextExpiry and it already reaches the
-- UI, but nothing read it on a schedule, so a buyer with unspent prepaid
-- posts simply lost them on the expiry date with no warning. The sweep that
-- fixes that runs daily, and a pack sits inside the warning window for
-- weeks, so it needs somewhere to record that the mail already went.
ALTER TABLE "posting_credit_packs" ADD COLUMN "expiry_warning_sent_at" TIMESTAMP(3);

-- The sweep selects on "expires soon AND not yet warned AND still has
-- credits". Partial index so it stays cheap as the table grows: the vast
-- majority of rows are already warned or already dead.
CREATE INDEX "posting_credit_packs_expiry_sweep_idx"
    ON "posting_credit_packs" ("expires_at")
    WHERE "expiry_warning_sent_at" IS NULL
      AND "refunded_at" IS NULL
      AND "disputed_at" IS NULL;
