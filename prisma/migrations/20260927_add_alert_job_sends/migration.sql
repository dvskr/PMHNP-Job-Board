-- One row per (recipient, job) that any alert chain has mailed.
--
-- JobAlert.last_sent_at is a cutoff, not a record of what was sent. A second
-- chain reading its own cutoff would re-send everything the digest already
-- mailed on its first run; sharing the cutoff would make whichever cron ran
-- first starve the other. The chains coordinate through these rows instead,
-- and the unique index is what makes "once" actually mean once under
-- concurrency rather than "usually once".

CREATE TABLE "alert_job_sends" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_job_sends_pkey" PRIMARY KEY ("id")
);

-- The enforcement, not a convenience index.
CREATE UNIQUE INDEX "alert_job_sends_email_job_id_key" ON "alert_job_sends"("email", "job_id");

-- "What has this person already been sent, most recent first."
CREATE INDEX "alert_job_sends_email_sent_at_idx" ON "alert_job_sends"("email", "sent_at" DESC);

-- Supports the cascade below and per-job diagnostics.
CREATE INDEX "alert_job_sends_job_id_idx" ON "alert_job_sends"("job_id");

ALTER TABLE "alert_job_sends"
    ADD CONSTRAINT "alert_job_sends_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which email an alert wants: "brief" (the digest) or "full_jd" (one
-- employer posting, whole description). Defaults to brief so no existing
-- subscriber is moved onto the heavier format by this migration.
ALTER TABLE "job_alerts" ADD COLUMN "delivery_format" TEXT NOT NULL DEFAULT 'brief';
