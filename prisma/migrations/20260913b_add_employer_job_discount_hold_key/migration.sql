-- Atomic mutex for the once-per-identity first-post discount.
--
-- The discount gate COUNTS an employer's prior posts and the row insert ACTS
-- on that count, so two checkout requests fired at the same instant could both
-- read "no prior posts" and each mint a payable half-price Stripe session.
-- Expiring earlier sessions cannot close that window: neither request has
-- created its session yet when the other looks.
--
-- A UNIQUE index moves the serialization into Postgres. The column holds the
-- acct: quota key of whoever claimed the discount, and only one row can hold
-- a given key. NULLs do not collide in a Postgres unique index, so every
-- standard post and every renewal is unaffected.
--
-- Backfill is deliberately omitted. Employers who already bought a discounted
-- post have no hold, and they do not need one: the existing count already
-- prices their next post as standard. The hold exists to serialize concurrent
-- claims from here forward, and it backstops that count rather than replacing
-- it.
ALTER TABLE "employer_jobs" ADD COLUMN "discount_hold_key" TEXT;

CREATE UNIQUE INDEX "employer_jobs_discount_hold_key_key"
  ON "employer_jobs"("discount_hold_key");
