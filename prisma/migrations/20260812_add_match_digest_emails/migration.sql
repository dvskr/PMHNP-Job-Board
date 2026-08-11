-- Employer match-digest emails: cadence ledger + click-tracking anchor for
-- the /api/cron/employer-match-digest cron. See MatchDigestEmail in
-- prisma/schema.prisma for the claim-first send discipline this table backs.

-- CreateTable
CREATE TABLE "match_digest_emails" (
    "id" TEXT NOT NULL,
    "employer_job_id" TEXT NOT NULL,
    "profile_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "click_token" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- UTC calendar day of sent_at ('YYYY-MM-DD'). Carries the per-posting
    -- uniqueness below; the 7-day cooldown alone is a read-then-write check
    -- that two overlapping cron invocations can both pass.
    "sent_day" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3),
    "follow_up_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_digest_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_digest_emails_click_token_key" ON "match_digest_emails"("click_token");

-- CreateIndex
-- One digest per posting per UTC day. This is the DB-level dedupe behind the
-- claim-first send: a concurrent invocation's duplicate INSERT fails with
-- 23505 (Prisma P2002) and that run skips the posting instead of sending a
-- second email to the same employer.
CREATE UNIQUE INDEX "match_digest_emails_employer_job_id_sent_day_key" ON "match_digest_emails"("employer_job_id", "sent_day");

-- CreateIndex
CREATE INDEX "match_digest_emails_employer_job_id_sent_at_idx" ON "match_digest_emails"("employer_job_id", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "match_digest_emails_sent_at_clicked_at_follow_up_sent_at_idx" ON "match_digest_emails"("sent_at", "clicked_at", "follow_up_sent_at");

-- AddForeignKey
ALTER TABLE "match_digest_emails" ADD CONSTRAINT "match_digest_emails_employer_job_id_fkey" FOREIGN KEY ("employer_job_id") REFERENCES "employer_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
