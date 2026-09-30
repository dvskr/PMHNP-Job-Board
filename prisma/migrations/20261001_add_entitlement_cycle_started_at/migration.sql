-- When a posting's CURRENT unlock and InMail buckets began.
--
-- A renewal is sold as a fresh allowance: the renewal receipt says "you also
-- got a fresh N candidate unlocks and N InMails", both expiry emails repeat
-- it, the dashboard renewal modal lists it, and Terms section 7 states it as
-- a feature of every posting "whether charged at the first-posting rate, the
-- standard rate, or renewed".
--
-- No code granted it. getUnlocksForPosting counted every ProfileView ever
-- attributed to the posting, with no lower bound, and the renewal webhook
-- branch wrote only paymentStatus, pricingTier and the two expiry warning
-- stamps. So an employer who spent their allowance and then paid to renew was
-- refused on the next unlock while holding a receipt saying otherwise.
--
-- Backfilled from created_at rather than left null, so the column is
-- meaningful for every row from the start. For a posting that has never been
-- renewed that is identical to the previous behaviour.
ALTER TABLE "employer_jobs" ADD COLUMN "entitlement_cycle_started_at" TIMESTAMP(3);

UPDATE "employer_jobs" SET "entitlement_cycle_started_at" = "created_at";

-- Unlock counting filters ProfileView by employer_job_id and viewed_at, which
-- is the query this column adds a lower bound to.
CREATE INDEX IF NOT EXISTS "profile_views_employer_job_viewed_idx"
    ON "profile_views" ("employer_job_id", "viewed_at");
